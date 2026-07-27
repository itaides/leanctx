# leanctx (Go)

Zero-dependency prompt compression for LLM applications — the Go port of
[`docs/parity-spec.md`](../docs/parity-spec.md), byte-compatible with the
TypeScript reference (asserted against `../parity/*.json`). Uses only the
standard library, including `net/http` for the SelfLLM provider calls.

```go
import leanctx "github.com/jia-gao/leanctx/go"

mw := leanctx.NewMiddleware(leanctx.Config{
    Mode:    "on",
    Routing: map[string]string{"prose": "extract"},
})
compressed, stats := mw.CompressMessages(messages) // []map[string]any
```

`SelfLLM` (LLM-delegated summarization for anthropic/openai/gemini) runs over
stdlib `net/http` with an injectable `*http.Client`:

```go
s := leanctx.NewSelfLLM(leanctx.Anthropic, apiKey)
out, stats, err := s.Compress(messages)
```

```bash
go test ./...    # includes the golden-vector parity suite
```

MIT. See the repo root `LICENSE`.
