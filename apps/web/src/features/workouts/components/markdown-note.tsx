import { renderJournalMarkdown } from '@/features/journal/lib/markdown';
import { cn } from '@/lib/utils';

type MarkdownNoteProps = {
  className?: string;
  content: string;
};

export function MarkdownNote({ className, content }: MarkdownNoteProps) {
  return (
    <div
      className={cn(
        '[&_br]:block [&_br]:content-[""] [&_code]:rounded-sm [&_code]:bg-secondary/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
        '[&_em]:italic [&_h2]:mt-1 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_li]:list-disc [&_li]:text-inherit [&_p]:text-inherit [&_p]:leading-6 [&_strong]:font-semibold [&_ul]:space-y-1 [&_ul]:pl-5',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: renderJournalMarkdown(content) }}
    />
  );
}
