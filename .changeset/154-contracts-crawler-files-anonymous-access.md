---
'@endora-commerce/contracts': minor
---

`storefrontCrawlerFilesSchema` gains an optional `anonymousAccess` boolean: `false` on a sales
channel closed to anonymous visitors, whose `robots.txt` then disallows everything and whose
`llms.txt` lists nothing. Optional so that an answer from an earlier backend, which never sends
it, still parses; read its absence as `true`.
