"use client"

// AI 리서치 워크벤치 — MeetingEditor 분해(P0)로 추출. 웹검색 리서치·후속질문·이미지·초안/검증·
// 꼬리물기 그래프까지 리서치 관련 상태 전부를 소유한다.
// graphData만 부모(MeetingEditor)가 소유 — 저장 payload·dirty 판정에 들어가기 때문.
import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, X, Search, Image as ImageIcon, Check, ShieldCheck, Network } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { cn } from "@/lib/utils"
import { tagBg } from "@/lib/meetingMeta"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { ResearchGraph } from "./ResearchGraph"
import { mdToContent, type GraphData } from "./meetingContent"

const VERDICT_LABEL: Record<string, string> = { supported: "검증", weak: "주의", unsupported: "미검증" }
const VERDICT_COLOR: Record<string, string> = { supported: "green", weak: "yellow", unsupported: "red" }

export function ResearchPanel({
  open,
  onClose,
  canEdit,
  editorRef,
  graphData,
  setGraphData,
  title,
}: {
  open: boolean
  onClose: () => void
  canEdit: boolean
  editorRef: React.MutableRefObject<Editor | null>
  graphData: GraphData | null
  setGraphData: (g: GraphData | null) => void
  title: string
}) {
  const [researchQuery, setResearchQuery] = useState("")
  const [researchBusy, setResearchBusy] = useState(false)
  const [researchResult, setResearchResult] = useState<{ text: string; sources: { url: string; title?: string }[]; searched: boolean } | null>(null)
  // 대화형 — 이전 질문 누적(고도화). 마지막 정리본(researchResult)을 prior로 넘겨 이어감.
  const [researchTurns, setResearchTurns] = useState<{ role: "user" | "assistant"; text: string }[]>([])
  const [followupQuery, setFollowupQuery] = useState("")

  // 리서치 실행 — followup이 있으면 이전 정리본 위에 이어서 고도화.
  const runResearch = async (followup?: string) => {
    const isFollow = typeof followup === "string"
    const q = (isFollow ? followup : researchQuery).trim()
    if (!q || researchBusy) return
    setResearchBusy(true)
    const prior = isFollow ? researchResult?.text : undefined
    if (isFollow) setFollowupQuery("")
    else {
      setResearchResult(null)
      setResearchTurns([])
    }
    setResearchTurns((t) => [...t, { role: "user", text: q }])
    const topicForGraph = isFollow ? researchQuery : q
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 75000)
    try {
      const res = await fetch("/api/meeting-notes/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          context: prior ? "" : (editorRef.current?.getText().slice(0, 4000) ?? ""),
          prior: prior ?? "",
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error("리서치에 실패했어요.")
      const data = (await res.json()) as { text: string; sources: { url: string; title?: string }[]; searched: boolean }
      setResearchResult(data)
      setResearchTurns((t) => [...t, { role: "assistant", text: data.text }])
      // 리서치하면 그래프도 동시에 — 내용+망 함께(고도화 시 망도 갱신)
      void runGraph(data.text, topicForGraph, true)
    } catch (e) {
      const aborted = (e as { name?: string } | null)?.name === "AbortError"
      toast.error(aborted ? "리서치가 너무 오래 걸려요. 주제를 좁혀 다시 시도해 주세요." : e instanceof Error ? e.message : "리서치에 실패했어요.")
    } finally {
      clearTimeout(timer)
      setResearchBusy(false)
    }
  }
  const insertResearch = () => {
    const t = researchResult?.text.trim()
    if (!t) return
    editorRef.current?.chain().focus("end").insertContent(mdToContent(t)).run()
    onClose()
    setResearchResult(null)
  }

  // 2b 이미지 — 리서치 출처에서 대표 이미지 후보 추출 → 선택 → meeting-media로 가져와 삽입.
  const [imgBusy, setImgBusy] = useState(false)
  const [imgCandidates, setImgCandidates] = useState<{ image: string; source: string; title?: string }[] | null>(null)
  const [imgSelected, setImgSelected] = useState<Set<string>>(new Set())
  const [imgInserting, setImgInserting] = useState(false)

  const findImages = async () => {
    const urls = researchResult?.sources.map((s) => s.url) ?? []
    if (urls.length === 0) {
      toast.error("출처가 없어 이미지를 찾을 수 없어요.")
      return
    }
    setImgBusy(true)
    setImgCandidates(null)
    setImgSelected(new Set())
    try {
      const res = await fetch("/api/meeting-notes/research/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      })
      if (!res.ok) throw new Error("이미지 검색에 실패했어요.")
      setImgCandidates(((await res.json()) as { images: { image: string; source: string; title?: string }[] }).images)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "이미지 검색에 실패했어요.")
    } finally {
      setImgBusy(false)
    }
  }
  const toggleImg = (url: string) =>
    setImgSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  const insertImages = async () => {
    if (imgSelected.size === 0) return
    setImgInserting(true)
    try {
      const imported = await Promise.all(
        [...imgSelected].map(async (src) => {
          try {
            const res = await fetch("/api/meeting-notes/research/image-import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: src }),
            })
            return res.ok ? ((await res.json()) as { url: string }).url : null
          } catch {
            return null
          }
        })
      )
      const urls = imported.filter((u): u is string => !!u)
      if (urls.length === 0) {
        toast.error("이미지를 가져오지 못했어요.")
        return
      }
      editorRef.current
        ?.chain()
        .focus("end")
        .insertContent(urls.map((src) => ({ type: "image", attrs: { src, width: "60%" } })))
        .run()
      toast.success(`이미지 ${urls.length}개를 본문에 넣었어요.`)
      setImgCandidates(null)
      setImgSelected(new Set())
    } finally {
      setImgInserting(false)
    }
  }

  // 2c 초안 + 검증 — 리서치 자료로 보고서/기획서 초안 → 적대적 팩트체크.
  const [draftType, setDraftType] = useState<"report" | "proposal">("report")
  const [draftBusy, setDraftBusy] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    overall: string
    items: { claim: string; verdict: "supported" | "weak" | "unsupported"; note: string }[]
  } | null>(null)

  const runDraft = async () => {
    const material = researchResult?.text.trim()
    if (!material || draftBusy) return
    setDraftBusy(true)
    setDraft(null)
    setVerifyResult(null)
    try {
      const res = await fetch("/api/meeting-notes/research/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: researchQuery, material, type: draftType }),
      })
      if (!res.ok) throw new Error("초안 작성에 실패했어요.")
      setDraft(((await res.json()) as { draft: string }).draft)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "초안 작성에 실패했어요.")
    } finally {
      setDraftBusy(false)
    }
  }
  const runVerify = async () => {
    const material = researchResult?.text.trim()
    if (!draft || !material || verifyBusy) return
    setVerifyBusy(true)
    setVerifyResult(null)
    try {
      const res = await fetch("/api/meeting-notes/research/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, material }),
      })
      if (!res.ok) throw new Error("검증에 실패했어요.")
      setVerifyResult(
        (await res.json()) as { overall: string; items: { claim: string; verdict: "supported" | "weak" | "unsupported"; note: string }[] }
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "검증에 실패했어요.")
    } finally {
      setVerifyBusy(false)
    }
  }
  const insertDraft = () => {
    if (!draft?.trim()) return
    editorRef.current?.chain().focus("end").insertContent(mdToContent(draft)).run()
    toast.success("초안을 본문에 넣었어요.")
  }

  // 지식 그래프 — 리서치 자료에서 개체·관계 추출 → 움직이는 망(보기 전용 오버레이).
  const [graphBusy, setGraphBusy] = useState(false)
  const [graphCollapsed, setGraphCollapsed] = useState(false) // X=접기(데이터 유지) — 저장 시 그래프 삭제 방지

  const runGraph = async (materialArg?: string, topicArg?: string, silent = false) => {
    const material = (materialArg ?? researchResult?.text ?? "").trim()
    if (!material || graphBusy) return
    setGraphBusy(true)
    try {
      const res = await fetch("/api/meeting-notes/research/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topicArg ?? researchQuery, material }),
      })
      if (!res.ok) throw new Error("꼬리물기 생성에 실패했어요.")
      const data = (await res.json()) as GraphData
      if (data.nodes.length === 0) {
        if (!silent) toast.error("꼬리물기로 만들 내용을 찾지 못했어요.")
        return
      }
      setGraphData(data)
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "꼬리물기 생성에 실패했어요.")
    } finally {
      setGraphBusy(false)
    }
  }

  return (
    <>
      {canEdit && open && (
        <div className="mt-2 rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Search className="size-3" /> AI 리서치 · 웹에서 자료를 모아 신뢰도로 정리
            </span>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex gap-1.5">
            <input
              value={researchQuery}
              onChange={(e) => setResearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runResearch()}
              placeholder="조사할 주제 (예: 2026 K-뷰티 트렌드, 경쟁사 N사 동향)"
              className={`${fieldClass} flex-1`}
            />
            <Button type="button" size="sm" onClick={() => runResearch()} disabled={researchBusy || !researchQuery.trim()}>
              {researchBusy && <Loader2 className="size-3.5 animate-spin" />} 검색
            </Button>
          </div>

          {/* 대화 히스토리(이전 질문) — 누적 고도화 흐름 */}
          {researchTurns.filter((t) => t.role === "user").length > 1 && (
            <div className="mt-2 flex flex-col gap-1">
              {researchTurns
                .filter((t) => t.role === "user")
                .slice(0, -1)
                .map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">질문 {i + 1}</span>
                    <span className="truncate">{t.text}</span>
                  </div>
                ))}
            </div>
          )}

          {researchBusy && !researchResult && (
            <div className="mt-2 flex items-center gap-1.5 py-3 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> 자료를 모으는 중…
            </div>
          )}
          {researchResult && (
            <>
              {!researchResult.searched && (
                <p className="mt-2 text-[11px] text-warning">웹 검색 비활성 — Claude 지식 기반(최신성 한계). Anthropic 콘솔에서 web search 활성화가 필요해요.</p>
              )}
              <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">{researchResult.text}</div>

              {/* 대화형 후속 질문 — 정리본을 이어서 고도화 */}
              <div className="mt-2 border-t pt-2">
                <div className="mb-1 flex flex-wrap gap-1">
                  {["더 깊게 파줘", "출처 더 찾아줘", "경쟁사 중심으로", "최신 데이터로", "리스크·반론도"].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => runResearch(q)}
                      disabled={researchBusy}
                      className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    value={followupQuery}
                    onChange={(e) => setFollowupQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && followupQuery.trim() && runResearch(followupQuery)}
                    placeholder="이어서 더 물어보기 (예: B2B 사례 중심으로 다시)"
                    disabled={researchBusy}
                    className={`${fieldClass} flex-1`}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => followupQuery.trim() && runResearch(followupQuery)} disabled={researchBusy || !followupQuery.trim()}>
                    {researchBusy ? <Loader2 className="size-3.5 animate-spin" /> : "이어서"}
                  </Button>
                </div>
              </div>
              {researchResult.sources.length > 0 && (
                <div className="mt-2 flex flex-col gap-0.5 border-t pt-2">
                  <span className="text-[11px] font-medium text-muted-foreground">출처</span>
                  {researchResult.sources.slice(0, 8).map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="truncate text-[11px] text-primary hover:underline">
                      {s.title || s.url}
                    </a>
                  ))}
                </div>
              )}
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={() => runGraph()} disabled={graphBusy}>
                  {graphBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Network className="size-3.5" />} 꼬리물기
                </Button>
                {researchResult.sources.length > 0 && (
                  <Button type="button" variant="outline" size="sm" onClick={findImages} disabled={imgBusy}>
                    {imgBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />} 이미지 찾기
                  </Button>
                )}
                <Button type="button" size="sm" onClick={insertResearch} disabled={!researchResult.text.trim()}>
                  <Plus className="size-3.5" /> 본문에 삽입
                </Button>
              </div>
              {imgCandidates && (
                <div className="mt-2 border-t pt-2">
                  {imgCandidates.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">출처에서 이미지를 찾지 못했어요.</p>
                  ) : (
                    <>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          이미지 선택 {imgSelected.size}/{imgCandidates.length}
                        </span>
                        <Button type="button" size="sm" onClick={insertImages} disabled={imgInserting || imgSelected.size === 0}>
                          {imgInserting && <Loader2 className="size-3.5 animate-spin" />} 선택 삽입
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {imgCandidates.map((c) => {
                          const on = imgSelected.has(c.image)
                          return (
                            <button
                              key={c.image}
                              type="button"
                              onClick={() => toggleImg(c.image)}
                              title={c.title || c.source}
                              className={cn(
                                "relative aspect-video overflow-hidden rounded-md border-2 bg-muted/40 transition-colors",
                                on ? "border-primary" : "border-transparent hover:border-border"
                              )}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={c.image}
                                alt=""
                                loading="lazy"
                                className="size-full object-cover"
                                onError={(e) => {
                                  // 로드 실패(hotlink 차단 등) 후보 썸네일은 숨김 — 깨진 이미지 노출 방지
                                  const b = e.currentTarget.closest("button")
                                  if (b) b.style.display = "none"
                                }}
                              />
                              {on && (
                                <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                                  <Check className="size-3" />
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 2c 초안 + 검증 */}
              <div className="mt-2 border-t pt-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">초안</span>
                  <div className="flex rounded-lg border p-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setDraftType("report")}
                      className={cn("rounded px-2 py-0.5 transition-colors", draftType === "report" ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}
                    >
                      보고서
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftType("proposal")}
                      className={cn("rounded px-2 py-0.5 transition-colors", draftType === "proposal" ? "bg-muted font-medium text-foreground" : "text-muted-foreground")}
                    >
                      기획서
                    </button>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={runDraft} disabled={draftBusy}>
                    {draftBusy && <Loader2 className="size-3.5 animate-spin" />} 초안 작성
                  </Button>
                </div>
                {draft && (
                  <>
                    <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 text-sm">{draft}</div>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
                      <Button type="button" variant="outline" size="sm" onClick={runVerify} disabled={verifyBusy}>
                        {verifyBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />} 검증
                      </Button>
                      <Button type="button" size="sm" onClick={insertDraft}>
                        <Plus className="size-3.5" /> 초안 삽입
                      </Button>
                    </div>
                  </>
                )}
                {verifyResult && (
                  <div className="mt-2 rounded-md border bg-background/60 p-2">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">{verifyResult.overall}</p>
                    <ul className="flex flex-col gap-1">
                      {verifyResult.items.map((it, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <span
                            className="mt-0.5 shrink-0 rounded px-1 text-[10px] font-medium"
                            style={{ backgroundColor: tagBg(VERDICT_COLOR[it.verdict] ?? "gray") }}
                          >
                            {VERDICT_LABEL[it.verdict] ?? "?"}
                          </span>
                          <span>
                            <span className="font-medium">{it.claim}</span> <span className="text-muted-foreground">— {it.note}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {graphData && (
                <ResearchGraph
                  nodes={graphData.nodes}
                  links={graphData.links}
                  topic={researchQuery}
                  material={researchResult.text}
                  onInsert={(text) => editorRef.current?.chain().focus("end").insertContent(mdToContent(text)).run()}
                  onClose={() => setGraphData(null)}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* 저장된 꼬리물기 그래프 복원 — 리서치 세션 밖(노트 다시 열기)에서도 보이게. X=접기(데이터 유지, 저장해도 안 지워짐). */}
      {graphData &&
        !researchResult &&
        (graphCollapsed ? (
          <button
            type="button"
            onClick={() => setGraphCollapsed(false)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Network className="size-3.5" /> 꼬리물기 그래프 보기
          </button>
        ) : (
          <div className="mt-4">
            <ResearchGraph
              nodes={graphData.nodes}
              links={graphData.links}
              topic={researchQuery || title}
              material=""
              onInsert={(text) => editorRef.current?.chain().focus("end").insertContent(mdToContent(text)).run()}
              onClose={() => setGraphCollapsed(true)}
            />
          </div>
        ))}
    </>
  )
}
