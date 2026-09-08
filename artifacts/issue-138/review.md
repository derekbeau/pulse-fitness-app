# Internal review and dispositions

Reviewer requested through the internal collaboration runtime: `gpt-5.6-luna`,
reasoning `medium`, task `/root/luna_review`. The runtime exposed no Fast selector;
Fast was neither requested through an unsupported parameter nor claimed enabled.
This is an internal review, not independent parent acceptance.

One consolidated read-only review covered policy, ownership/authentication,
persistence/provenance/history, ranking/recurrence, schemas/docs, and tests.
The reviewer ran no tests, browser, or full gates and edited no files.

| Finding                                                                                        | Disposition                                                                                                                                                                                | Focused evidence                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2: food creation before the meal transaction leaves an orphan definition after a meal failure | Fixed. Middleware stages a server-only WeakMap intent; the normalized item carries it into the existing create/append transaction. `materializeMealFood` inserts through that transaction. | Failure-injection tests on preferred create, date-scoped create, and append assert unchanged food/item/meal snapshots and exact usage after aborted item insertion.                          |
| P2: concurrent find-then-create can duplicate saved definitions                                | Fixed. Transactional materialization rechecks unique exact owned identity/brand before inserting, reusing the first committed definition.                                                  | Simultaneous API creates return one created and one reused outcome, one definition, two links, and exact count/recency; repeated items in one current write also create only one definition. |

The same reviewer performed a targeted disposition readback, limited to these
findings and their fixes. Its final response:

> Both findings are resolved.
>
> Creation is now staged as a server-only intent and materialized inside the meal transaction. Failures roll back the food definition with the meal.
>
> Materialization performs an owner-scoped exact reuse recheck inside the transaction before inserting, preventing duplicate definitions under concurrent identical requests. WeakMap plan transfer preserves intents through normalization.
>
> No remaining atomicity or concurrency finding.

The consolidated pass reported no additional definite owner-isolation or
historical-snapshot defect. Full gates and isolated browser acceptance remain
pending explicit parent authorization.
