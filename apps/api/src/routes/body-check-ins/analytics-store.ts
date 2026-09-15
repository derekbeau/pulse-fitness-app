import { createHash } from 'node:crypto';

import {
  BODY_PROGRESS_ANALYTICS_CONSTANTS,
  BODY_PROGRESS_ANALYTICS_VERSION,
  analyzeBodyProgressSegments,
  bodyProgressAnalyticsSchema,
  buildBodyProgressSignal,
  resolveChartDateRange,
  type BodyProgressAnalytics,
  type BodyProgressAnalyticsQuery,
  type BodyProgressLegacyPoint,
  type BodyProgressPoint,
  type BodyProgressReasonCode,
  type BodyProgressStrengthEvidence,
  type BodyProgressContextSummary,
} from '@pulse/shared';
import { and, asc, eq, lte } from 'drizzle-orm';

import {
  bodyCheckInMeasurements,
  bodyCheckInPreferences,
  bodyCheckIns,
  bodyMeasurements,
} from '../../db/schema/index.js';
import { getTrendWeightAnalytics } from '../weight/trend-store.js';
import { readWorkoutProgressionEvidenceForBodyProgress } from '../workout-progression/store.js';

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

const fingerprint = (value: unknown) =>
  createHash('sha256').update(stableSerialize(value)).digest('hex');

const legacyFields = [
  ['waist', 'waistMm'],
  ['hips', 'hipsMm'],
  ['chest', 'chestMm'],
  ['neck', 'neckMm'],
  ['left_arm', 'leftArmMm'],
  ['right_arm', 'rightArmMm'],
  ['left_thigh', 'leftThighMm'],
  ['right_thigh', 'rightThighMm'],
] as const;

function adaptStrengthEvidence(
  evidence: Awaited<ReturnType<typeof readWorkoutProgressionEvidenceForBodyProgress>>,
): BodyProgressStrengthEvidence {
  if (evidence.recommendations.length === 0) {
    return {
      state: evidence.staleSourceCount > 0 ? 'stale' : 'unavailable',
      confidence: 'unavailable',
      sourceContract: 'workout-progression-v1',
      sourceDates: [],
      recommendationIds: [],
      sourceFingerprints: [],
      reason:
        evidence.staleSourceCount > 0
          ? 'Only stale server-owned workout progression decisions were available in this range.'
          : 'No current server-owned workout progression decisions were available in this range.',
    };
  }
  const decisions = new Set(evidence.recommendations.map((item) => item.decision));
  const state =
    decisions.has('increase') && decisions.has('reduce')
      ? 'mixed'
      : decisions.has('reduce')
        ? 'declining'
        : decisions.has('increase')
          ? 'improving'
          : 'stable';
  const ordered = [...evidence.recommendations].sort(
    (left, right) =>
      (left.evidence.sourceSessionDate ?? '').localeCompare(
        right.evidence.sourceSessionDate ?? '',
      ) || left.id.localeCompare(right.id),
  );
  return {
    state,
    confidence: ordered.every((item) => item.confidence === 'supported') ? 'supported' : 'limited',
    sourceContract: 'workout-progression-v1',
    sourceDates: [...new Set(ordered.flatMap((item) => item.evidence.sourceSessionDate ?? []))],
    recommendationIds: ordered.map((item) => item.id),
    sourceFingerprints: ordered.map((item) => item.sourceFingerprint),
    reason: `Aggregated ${ordered.length} current server-owned progression decision${ordered.length === 1 ? '' : 's'} without recalculating performance.`,
  };
}

export async function getBodyProgressAnalytics(
  userId: string,
  query: BodyProgressAnalyticsQuery,
): Promise<BodyProgressAnalytics> {
  const { db } = await import('../../db/index.js');
  const trend = await getTrendWeightAnalytics(userId, query);
  const endDate = trend.range.endDate;
  const allPointRows = db
    .select({
      checkInId: bodyCheckIns.id,
      measurementId: bodyCheckInMeasurements.id,
      date: bodyCheckIns.date,
      checkInVersion: bodyCheckIns.version,
      site: bodyCheckInMeasurements.site,
      laterality: bodyCheckInMeasurements.laterality,
      canonicalMm: bodyCheckInMeasurements.canonicalMm,
      reading1Mm: bodyCheckInMeasurements.reading1Mm,
      reading2Mm: bodyCheckInMeasurements.reading2Mm,
      reading3Mm: bodyCheckInMeasurements.reading3Mm,
      unitAtEntry: bodyCheckInMeasurements.unitAtEntry,
      quality: bodyCheckInMeasurements.quality,
      protocolId: bodyCheckInMeasurements.protocolId,
      protocolVersion: bodyCheckInMeasurements.protocolVersion,
      source: bodyCheckIns.source,
      sourceId: bodyCheckIns.sourceId,
      correctedAt: bodyCheckIns.correctedAt,
      correctionReason: bodyCheckIns.correctionReason,
      createdAt: bodyCheckInMeasurements.createdAt,
      updatedAt: bodyCheckInMeasurements.updatedAt,
    })
    .from(bodyCheckIns)
    .innerJoin(bodyCheckInMeasurements, eq(bodyCheckInMeasurements.checkInId, bodyCheckIns.id))
    .where(
      and(
        eq(bodyCheckIns.userId, userId),
        eq(bodyCheckIns.status, 'completed'),
        lte(bodyCheckIns.date, endDate),
      ),
    )
    .orderBy(asc(bodyCheckIns.date), asc(bodyCheckInMeasurements.id))
    .all();
  const legacyRows = db
    .select()
    .from(bodyMeasurements)
    .where(and(eq(bodyMeasurements.userId, userId), lte(bodyMeasurements.date, endDate)))
    .orderBy(asc(bodyMeasurements.date), asc(bodyMeasurements.id))
    .all();
  const earliestDate =
    [trend.range.startDate, allPointRows[0]?.date, legacyRows[0]?.date]
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? endDate;
  const range =
    query.range === 'all'
      ? resolveChartDateRange({ preset: 'all', referenceDate: endDate, earliestDate })
      : resolveChartDateRange({ preset: query.range, referenceDate: endDate });
  const preference = db
    .select({
      cadenceDays: bodyCheckInPreferences.measurementCadenceDays,
      enabledSites: bodyCheckInPreferences.enabledSites,
    })
    .from(bodyCheckInPreferences)
    .where(eq(bodyCheckInPreferences.userId, userId))
    .get();
  const cadenceDays = preference?.cadenceDays ?? null;
  const enabledSites = preference?.enabledSites ?? [];
  const points: BodyProgressPoint[] = allPointRows
    .filter((row) => row.date >= range.startDate)
    .map((row) => ({
      checkInId: row.checkInId,
      measurementId: row.measurementId,
      date: row.date,
      checkInVersion: row.checkInVersion,
      site: row.site,
      laterality: row.laterality,
      canonicalMm: row.canonicalMm,
      readingsMm: [row.reading1Mm, row.reading2Mm, row.reading3Mm],
      unitAtEntry: row.unitAtEntry,
      quality: row.quality,
      protocolId: row.protocolId,
      protocolVersion: row.protocolVersion,
      source: row.source,
      sourceId: row.sourceId,
      corrected: row.correctedAt !== null,
      correctedAt: row.correctedAt,
      correctionReason: row.correctionReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  const segments = analyzeBodyProgressSegments({ points, cadenceDays, asOfDate: endDate });
  const enabledKeys = new Set(enabledSites.map((site) => `${site.site}:${site.laterality}`));
  const enabledSegments = segments.filter((segment) =>
    enabledKeys.has(`${segment.site}:${segment.laterality}`),
  );
  const legacyPoints: BodyProgressLegacyPoint[] = legacyRows
    .filter((row) => row.date >= range.startDate)
    .flatMap((row) =>
      legacyFields.flatMap(([site, field]) => {
        const canonicalMm = row[field];
        return canonicalMm === null
          ? []
          : [
              {
                entryId: row.id,
                date: row.date,
                site,
                canonicalMm,
                unitAtEntry: row.unitAtEntry,
                provenance: 'legacy_unknown' as const,
                compatibility: 'unsupported' as const,
                limitation:
                  'Legacy scalar record: no repeated-reading, exact protocol-version, or correction-history provenance.',
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
              },
            ];
      }),
    );
  const progression = await readWorkoutProgressionEvidenceForBodyProgress({
    userId,
    startDate: range.startDate,
    endDate,
  });
  const strengthEvidence = adaptStrengthEvidence(progression);
  const paceDirection = trend.explanation.facts.paceDirection;
  const weight = {
    sourceContract: 'trend-weight-v1' as const,
    sourceFingerprint: trend.sourceFingerprint,
    state: trend.current.state,
    direction:
      paceDirection === 'gaining'
        ? ('up' as const)
        : paceDirection === 'losing'
          ? ('down' as const)
          : paceDirection === 'stable'
            ? ('stable' as const)
            : ('unavailable' as const),
    trendWeight: trend.current.trendWeight,
    trendDate: trend.current.trendDate,
    recentPacePerWeek: trend.current.ratePerWeek,
    recentPaceEffectiveDate: trend.current.rateEffectiveDate,
    paceFreshness: trend.explanation.facts.paceFreshness,
    unit: trend.unit,
    observationCount: trend.current.evidence.observationCount,
    spanDays: trend.current.evidence.spanDays,
    latestAgeDays: trend.current.evidence.latestAgeDays,
  };
  const goal = {
    type: trend.goal?.type ?? ('unset' as const),
    sourceContract: 'trend-weight-v1' as const,
    goalId: trend.goal?.id ?? null,
    maintenanceBandState: trend.goal?.maintenanceBandState ?? null,
  };
  const signal = buildBodyProgressSignal({
    asOfDate: endDate,
    goal,
    weight,
    segments: enabledSegments,
    strength: strengthEvidence,
    cadenceDays,
  });
  const checkInDates = new Map<string, string>();
  for (const point of points) checkInDates.set(point.checkInId, point.date);
  const markers: BodyProgressAnalytics['markers'] = [
    ...[...checkInDates].map(([sourceId, date]) => ({
      id: `check-in:${sourceId}`,
      date,
      kind: 'check_in' as const,
      label: 'Body check-in',
      sourceId,
    })),
    ...points
      .filter(
        (point, index, all) =>
          point.corrected &&
          all.findIndex((candidate) => candidate.checkInId === point.checkInId) === index,
      )
      .map((point) => ({
        id: `correction:${point.checkInId}:${point.checkInVersion}`,
        date: point.date,
        kind: 'correction' as const,
        label: 'Corrected body check-in',
        sourceId: point.checkInId,
      })),
    ...segments.flatMap((segment) => {
      const siblings = segments
        .filter(
          (candidate) =>
            candidate.site === segment.site && candidate.laterality === segment.laterality,
        )
        .sort((left, right) =>
          (left.points[0]?.date ?? '').localeCompare(right.points[0]?.date ?? ''),
        );
      const firstPoint = segment.points[0];
      return siblings.indexOf(segment) <= 0 || !firstPoint
        ? []
        : [
            {
              id: `protocol:${segment.id}:${firstPoint.date}`,
              date: firstPoint.date,
              kind: 'protocol_change' as const,
              label: `Protocol changed to ${segment.protocolVersion}`,
              sourceId: firstPoint.checkInId,
            },
          ];
    }),
    ...trend.markers
      .filter((marker) => marker.kind === 'goal_started' || marker.kind === 'goal_revised')
      .map((marker) => ({
        id: `goal:${marker.kind}:${marker.id}`,
        date: marker.date,
        kind: marker.kind,
        label: marker.label,
        sourceId: marker.id,
      })),
  ].sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.kind.localeCompare(right.kind) ||
      left.id.localeCompare(right.id),
  );
  const completedCheckInCount = new Set(points.map((point) => point.checkInId)).size;
  const reasonCodes = [
    ...new Set(enabledSegments.flatMap((segment) => segment.analysis.reasonCodes)),
  ];
  const protocolCounts = new Map<string, Set<string>>();
  for (const segment of enabledSegments) {
    const key = `${segment.site}:${segment.laterality}`;
    const versions = protocolCounts.get(key) ?? new Set<string>();
    versions.add(segment.protocolVersion);
    protocolCounts.set(key, versions);
  }
  if ([...protocolCounts.values()].some((versions) => versions.size > 1))
    reasonCodes.push('INCOMPATIBLE_PROTOCOL_SEGMENTS');
  const supportedSegmentCount = enabledSegments.filter(
    (segment) => segment.analysis.state === 'supported',
  ).length;
  const readinessState =
    supportedSegmentCount > 0
      ? 'ready'
      : enabledSegments.some((segment) => segment.analysis.state === 'stale')
        ? 'stale'
        : enabledSegments.some((segment) => segment.analysis.state === 'freshness_unresolved')
          ? 'unresolved'
          : 'insufficient';
  const response = {
    range: { preset: query.range, startDate: range.startDate, endDate, asOfDate: endDate },
    timeZone: trend.timeZone,
    isHistorical: trend.isHistorical,
    algorithm: {
      version: BODY_PROGRESS_ANALYTICS_VERSION,
      ...BODY_PROGRESS_ANALYTICS_CONSTANTS,
      regression: 'dated_ordinary_least_squares' as const,
      interpolation: 'none' as const,
      highVariancePolicy: 'blocks_direction_preserves_history' as const,
    },
    goal,
    weight,
    readiness: {
      state: readinessState,
      completedCheckInCount,
      compatibleSegmentCount: enabledSegments.length,
      supportedSegmentCount,
      latestCompletedDate: [...checkInDates.values()].sort().at(-1) ?? null,
      cadenceDays,
      enabledSites,
      reasonCodes: [...new Set(reasonCodes)] as BodyProgressReasonCode[],
    },
    segments,
    legacyPoints,
    strengthEvidence,
    signal,
    markers,
    sourceFingerprint: '0'.repeat(64),
  } satisfies BodyProgressAnalytics;
  response.sourceFingerprint = fingerprint({ ...response, sourceFingerprint: undefined });
  return bodyProgressAnalyticsSchema.parse(response);
}

export async function getBodyProgressContextSummary(
  userId: string,
): Promise<BodyProgressContextSummary> {
  const analytics = await getBodyProgressAnalytics(userId, { range: '3m' });
  const sourceDates = [
    analytics.weight.trendDate,
    ...analytics.segments.flatMap((segment) => segment.points.map((point) => point.date)),
    ...analytics.strengthEvidence.sourceDates,
  ].filter((value): value is string => value !== null);
  return {
    contractVersion: BODY_PROGRESS_ANALYTICS_VERSION,
    asOfDate: analytics.range.asOfDate,
    signal: analytics.signal.state,
    confidence: analytics.signal.confidence,
    supportingFacts: analytics.signal.supportingFacts.slice(0, 6),
    contradictoryFacts: analytics.signal.contradictoryFacts.slice(0, 6),
    unavailableInputs: analytics.signal.unavailableInputs.slice(0, 6),
    sourceDates: [...new Set(sourceDates)].sort().slice(-12),
    sourceFingerprint: analytics.sourceFingerprint,
  };
}
