# Installed Chrome readback

Tool: `mcp__cua_repl.js`, native `com.google.Chrome`.
The Chrome browser extension surface was unavailable; native Chrome was available.
The initial native-app acquisition took approximately 30 minutes to return.
No alternate browser or production server was used.

Final source was served by `verify-food-usage-integrity.ts`, which creates a fresh
fictional database and binds only loopback. The final URL was
`http://127.0.0.1:53574/integrity-readback` (temporary acceptance server).

Literal final accessibility readback excerpts:

```text
Window: Food usage integrity — isolated acceptance - Google Chrome
URL: 127.0.0.1:53574/integrity-readback
heading Food usage integrity: PASS
text Disposable fictional SQLite fixture. No production connection.
"result": "PASS"
"url": "/api/v1/meals"
"status": 201
"linkedItems": 2
"url": "/api/v1/nutrition/2026-03-20/meals"
"status": 201
"linkedItems": 2
"trashStatus": 200
"mode": "dry-run"
"reconciled": 1
"changed": 0
"updated": 0
```

The earlier fixture page was also visually inspected using a native Chrome
screenshot. Final API/DB literal values are retained in readback.json; independent
COUNT/MAX agrees at four linked rows, `quick_check` is `ok`, and
`foreign_key_check` returns an empty array. Dry-run serialization is byte-identical.

After recording final evidence, the task-created Chrome tab was closed.
