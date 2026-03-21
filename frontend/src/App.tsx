import 'diff2html/bundles/css/diff2html.min.css'

import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { html as diff2htmlHtml } from 'diff2html'
import { createTwoFilesPatch } from 'diff'
import { AlertTriangle, Clipboard, Download, FileCode2, Sparkles, Wand2 } from 'lucide-react'
import Editor from '@monaco-editor/react'
import { toast } from 'sonner'

import { analyzeFile, refactorFile } from '@/api/refactorai'
import { getConfig, setConfig } from '@/api/config'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/store/useConfigStore'
import { useFileStore } from '@/store/useFileStore'

const MAX_BYTES = 2 * 1024 * 1024

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function severityBadgeVariant(sev: string) {
  switch (sev) {
    case 'critical':
    case 'high':
      return 'destructive'
    case 'medium':
      return 'secondary'
    default:
      return 'outline'
  }
}

async function readFileText(file: File) {
  return await file.text()
}

function downloadTextFile(fileName: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function App() {
  const { mode, setMode } = useConfigStore()
  const { file, originalCode, analysis, refactor, setFile, setOriginalCode, setAnalysis, setRefactor, resetResults } =
    useFileStore()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()
  const backendConfig = useQuery({
    queryKey: ['config'],
    queryFn: async () => await getConfig(),
    staleTime: 5_000,
    retry: 1,
  })

  const updateBackendMode = useMutation({
    mutationFn: async (m: 'local' | 'cloud') => await setConfig(m),
  })

  useEffect(() => {
    // Enforce default (persisted) mode to backend on first load.
    void updateBackendMode.mutateAsync(mode).catch(() => {
      // If backend isn't reachable yet, we'll retry when user interacts.
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeMode = backendConfig.data?.mode ?? mode
  const activeModel = backendConfig.data?.model ?? ''

  const analyzeMutation = useMutation({
    mutationFn: async (f: File) => await analyzeFile(f),
    onSuccess: (data) => {
      setAnalysis(data)
      toast.success('Analysis complete')
    },
    onError: (err: unknown) => {
      toast.error('Analysis failed', { description: err instanceof Error ? err.message : 'Unexpected error' })
    },
  })

  const refactorMutation = useMutation({
    mutationFn: async (f: File) => await refactorFile(f),
    onSuccess: (data) => {
      setRefactor(data)
      toast.success('Optimized version generated')
    },
    onError: (err: unknown) => {
      toast.error('Refactor failed', { description: err instanceof Error ? err.message : 'Unexpected error' })
    },
  })

  const diffHtml = useMemo(() => {
    const newCode = refactor?.refactored_code ?? ''
    if (!originalCode.trim() || !newCode.trim()) return ''
    const patch = createTwoFilesPatch('original.py', 'optimized.py', originalCode, newCode, '', '', { context: 5 })
    return diff2htmlHtml(patch, { drawFileList: false, matching: 'lines', outputFormat: 'side-by-side' })
  }, [originalCode, refactor?.refactored_code])

  const busy = analyzeMutation.isPending || refactorMutation.isPending

  const onPickFile = async (f: File | null) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.py')) {
      toast.error('Only .py files are supported')
      return
    }
    if (f.size > MAX_BYTES) {
      toast.error('File too large', { description: 'Max size is ~2MB.' })
      return
    }
    const text = await readFileText(f)
    setFile(f)
    setOriginalCode(text)
    resetResults()
  }

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault()
    const f = e.dataTransfer.files?.[0] ?? null
    await onPickFile(f)
  }

  const onBrowseClick = () => fileInputRef.current?.click()

  const onAnalyze = async () => {
    if (!file) return
    await analyzeMutation.mutateAsync(file)
  }

  const onRefactor = async () => {
    if (!file) return
    await refactorMutation.mutateAsync(file)
  }

  const canAnalyze = !!file && !busy
  const canRefactor = !!file && !busy

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Wand2 className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-semibold">RefactorAI</div>
              <div className="text-sm text-muted-foreground">
                AI-Powered Code Refactoring & Optimization Assistant (Python-first)
              </div>
            </div>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">Upload → Analyze → Optimize → Diff</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {activeMode === 'local' ? 'Running on Local Ollama (offline)' : 'Using Groq Cloud'}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {activeModel ? (
                        activeMode === 'local' ? (
                          <>
                            Active model:{' '}
                            <span className="font-mono">{activeModel}</span> — 7b model (optimized for 16GB RAM)
                          </>
                        ) : (
                          <>
                            Active model: <span className="font-mono">{activeModel}</span>
                          </>
                        )
                      ) : (
                        'Fetching model…'
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="text-xs font-medium text-muted-foreground">Mode</div>
                    <div className="flex w-full rounded-xl border bg-muted/20 p-1 sm:w-auto">
                      <button
                        type="button"
                        aria-pressed={mode === 'cloud'}
                        className={cn(
                          'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none',
                          mode === 'cloud' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={async () => {
                          const next = 'cloud' as const
                          setMode(next)
                          try {
                            const cfg = await updateBackendMode.mutateAsync(next)
                            queryClient.setQueryData(['config'], cfg)
                            toast.success('Switched to Cloud Mode (Groq)')
                          } catch (e) {
                            setMode('local')
                            toast.error('Failed to switch mode')
                          }
                        }}
                        disabled={updateBackendMode.isPending}
                      >
                        🌐 Cloud Mode (Groq)
                      </button>
                      <button
                        type="button"
                        aria-pressed={mode === 'local'}
                        className={cn(
                          'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none',
                          mode === 'local' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
                        )}
                        onClick={async () => {
                          const next = 'local' as const
                          setMode(next)
                          try {
                            const cfg = await updateBackendMode.mutateAsync(next)
                            queryClient.setQueryData(['config'], cfg)
                            toast.success('Switched to Local Mode (Ollama)')
                          } catch (e) {
                            setMode('cloud')
                            toast.error('Failed to switch mode')
                          }
                        }}
                        disabled={updateBackendMode.isPending}
                      >
                        💻 Local Mode (Ollama)
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileCode2 className="h-5 w-5" />
                  Upload a Python file
                </CardTitle>
                <CardDescription>Drag & drop or browse (max ~2MB).</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDrop}
                  onClick={onBrowseClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onBrowseClick()
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    'group cursor-pointer rounded-xl border border-dashed p-5 transition-colors',
                    'hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:text-foreground">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">Drop a `.py` file here</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Or click to open the file picker.
                      </div>
                      {file ? (
                        <div className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{file.name}</span>
                            <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".py"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0] ?? null
                    await onPickFile(f)
                    e.currentTarget.value = ''
                  }}
                />

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button onClick={onAnalyze} disabled={!canAnalyze} className="w-full">
                    {analyzeMutation.isPending ? 'Analyzing…' : 'Analyze'}
                  </Button>
                  <Button
                    onClick={onRefactor}
                    disabled={!canRefactor}
                    variant="secondary"
                    className="w-full"
                  >
                    {refactorMutation.isPending ? 'Generating…' : 'Generate Optimized'}
                  </Button>
                </div>

                {analysis ? (
                  <>
                    <Separator className="my-5" />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">Quality score</div>
                          <div className="text-xs text-muted-foreground">0–100 (LLM + static analysis)</div>
                        </div>
                        <div className="text-2xl font-semibold tabular-nums">{analysis.overall_score}</div>
                      </div>
                      <Progress value={analysis.overall_score} />

                      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                        <div className="font-medium">Summary</div>
                        <div className="mt-1 text-muted-foreground">{analysis.summary}</div>
                      </div>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            {analysis ? (
              <div className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Security findings
                    </CardTitle>
                    <CardDescription>Combined LLM + Bandit scan.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analysis.security_issues.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No obvious issues detected.</div>
                    ) : (
                      <div className="space-y-3">
                        {analysis.security_issues.map((s, idx) => (
                          <div key={idx} className="rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant={severityBadgeVariant(s.severity)}>{s.severity}</Badge>
                              <div className="text-xs text-muted-foreground">{s.location}</div>
                            </div>
                            <div className="mt-2 text-sm">{s.description}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Suggestions</CardTitle>
                    <CardDescription>High-signal improvements you can apply quickly.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {analysis.general_optimizations.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No suggestions returned.</div>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {analysis.general_optimizations.map((s, idx) => (
                          <li key={idx} className="rounded-md border bg-muted/20 px-3 py-2">
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>

          <div className="lg:col-span-8">
            <Card className="h-[calc(100dvh-10.5rem)] min-h-[42rem]">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>Workspace</CardTitle>
                    <CardDescription>Side-by-side code view with diff highlighting.</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!originalCode.trim()}
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(originalCode)
                          .then(() => toast.success('Copied original to clipboard'))
                          .catch(() => toast.error('Clipboard copy failed'))
                      }}
                    >
                      <Clipboard className="h-4 w-4" />
                      Copy original
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!refactor?.refactored_code?.trim()}
                      onClick={() => {
                        const text = refactor?.refactored_code ?? ''
                        void navigator.clipboard
                          .writeText(text)
                          .then(() => toast.success('Copied optimized to clipboard'))
                          .catch(() => toast.error('Clipboard copy failed'))
                      }}
                    >
                      <Clipboard className="h-4 w-4" />
                      Copy optimized
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!originalCode.trim()}
                      onClick={() => downloadTextFile(file?.name ?? 'original.py', originalCode)}
                    >
                      <Download className="h-4 w-4" />
                      Download original
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!refactor?.refactored_code?.trim()}
                      onClick={() =>
                        downloadTextFile(
                          (file?.name ?? 'optimized.py').replace(/\.py$/i, '') + '.optimized.py',
                          refactor?.refactored_code ?? '',
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      Download optimized
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="h-[calc(100%-5.5rem)] pt-0">
                <Tabs defaultValue="diff" className="h-full">
                  <TabsList>
                    <TabsTrigger value="diff">Diff</TabsTrigger>
                    <TabsTrigger value="editors">Side-by-side</TabsTrigger>
                    <TabsTrigger value="blocks" disabled={!analysis}>
                      Blocks
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="diff" className="h-[calc(100%-3.25rem)]">
                    {!refactor?.refactored_code ? (
                      <div className="grid h-full place-items-center rounded-xl border bg-muted/10">
                        <div className="max-w-sm text-center">
                          <div className="text-sm font-medium">No optimized output yet</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Upload a file, then click “Generate Optimized” to see a highlighted diff.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <ScrollArea className="h-full rounded-xl border bg-muted/5">
                        <div
                          className="p-4 [&_.d2h-file-header]:bg-transparent [&_.d2h-wrapper]:bg-transparent [&_.d2h-file-wrapper]:border-none"
                          // diff2html emits HTML; the input is generated locally from two strings.
                          dangerouslySetInnerHTML={{ __html: diffHtml }}
                        />
                      </ScrollArea>
                    )}
                  </TabsContent>

                  <TabsContent value="editors" className="h-[calc(100%-3.25rem)]">
                    <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="flex h-full flex-col overflow-hidden rounded-xl border">
                        <div className="border-b bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
                          Original
                        </div>
                        <div className="min-h-0 flex-1">
                          <Editor
                            height="100%"
                            language="python"
                            theme="vs-dark"
                            value={originalCode}
                            options={{
                              readOnly: true,
                              minimap: { enabled: false },
                              fontSize: 13,
                              scrollBeyondLastLine: false,
                            }}
                          />
                        </div>
                      </div>

                      <div className="flex h-full flex-col overflow-hidden rounded-xl border">
                        <div className="border-b bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground">
                          Optimized
                        </div>
                        <div className="min-h-0 flex-1">
                          <Editor
                            height="100%"
                            language="python"
                            theme="vs-dark"
                            value={refactor?.refactored_code ?? ''}
                            options={{
                              readOnly: true,
                              minimap: { enabled: false },
                              fontSize: 13,
                              scrollBeyondLastLine: false,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="blocks" className="h-[calc(100%-3.25rem)]">
                    {!analysis ? null : (
                      <ScrollArea className="h-full rounded-xl border">
                        <div className="p-4">
                          <Accordion type="multiple" className="w-full">
                            {analysis.blocks.map((b, idx) => (
                              <AccordionItem key={`${b.block_type}-${b.name}-${idx}`} value={`${idx}`}>
                                <AccordionTrigger>
                                  <div className="flex w-full items-center justify-between gap-3 pr-3">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline">{b.block_type}</Badge>
                                      <span className="font-medium">{b.name}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      L{b.start_line}–L{b.end_line}
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-3">
                                    <div className="rounded-lg border bg-muted/10 p-3 text-sm">
                                      <div className="font-medium">Explanation</div>
                                      <div className="mt-1 text-muted-foreground">{b.explanation}</div>
                                    </div>

                                    {b.anti_patterns.length ? (
                                      <div className="rounded-lg border bg-muted/10 p-3 text-sm">
                                        <div className="font-medium">Anti-patterns</div>
                                        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                                          {b.anti_patterns.map((s, i) => (
                                            <li key={i}>{s}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}

                                    {b.suggestions.length ? (
                                      <div className="rounded-lg border bg-muted/10 p-3 text-sm">
                                        <div className="font-medium">Suggestions</div>
                                        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                                          {b.suggestions.map((s, i) => (
                                            <li key={i}>{s}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : null}

                                    <div className="rounded-lg border bg-muted/10 p-3">
                                      <div className="mb-2 text-sm font-medium">Original code</div>
                                      <pre className="max-h-72 overflow-auto rounded-md bg-background/40 p-3 text-xs leading-relaxed">
                                        <code>{b.original_code}</code>
                                      </pre>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </div>
                      </ScrollArea>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
