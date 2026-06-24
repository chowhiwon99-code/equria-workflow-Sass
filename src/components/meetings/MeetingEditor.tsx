"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, Trash2, Loader2, Calendar, Users, Sparkles, Plus, RefreshCw, X, Search, Image as ImageIcon, Check, ShieldCheck, Network, FileDown } from "lucide-react"
import type { Editor } from "@tiptap/react"
import type { JSONContent } from "@tiptap/core"
import { createClient } from "@/lib/supabase/client"
import { mustOk } from "@/lib/supabase/mustOk"
import { cn } from "@/lib/utils"
import { tagBg } from "@/lib/meetingMeta"
import { Button } from "@/components/ui/button"
import { fieldClass } from "@/components/shared/Modal"
import { MeetingDocEditor } from "./editor/MeetingDocEditor"
import { ResearchGraph } from "./ResearchGraph"
import { useMeetingAi, AI_ACTION_LABEL, type AiAction } from "./useMeetingAi"
import type { Tables } from "@/lib/supabase/types"

type Note = Tables<"meeting_notes">
const AI_ACTIONS: AiAction[] = ["summarize", "actions", "polish"]
const VERDICT_LABEL: Record<string, string> = { supported: "검증", weak: "주의", unsupported: "미검증" }
const VERDICT_COLOR: Record<string, string> = { supported: "green", weak: "yellow", unsupported: "red" }

/** AI 평문 결과를 문단 노드로 — 본문(Tiptap)에 삽입/교체용. */
function linesToContent(text: string): JSONContent[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => (l.trim() ? { type: "paragraph", content: [{ type: "text", text: l }] } : { type: "paragraph" }))
}

/** 마크다운(리서치 결과)을 Tiptap 노드로 — 헤딩(##)·불릿(-)·문단. 인라인(**·링크)은 텍스트로(MVP). */
function mdToContent(text: string): JSONContent[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const out: JSONContent[] = []
  let bullets: JSONContent[] = []
  const flush = () => {
    if (bullets.length) {
      out.push({ type: "bulletList", content: bullets })
      bullets = []
    }
  }
  for (const raw of lines) {
    const l = raw.trim().replace(/\*\*/g, "")
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    const b = l.match(/^[-*]\s+(.*)$/)
    if (h) {
      flush()
      out.push({ type: "heading", attrs: { level: Math.min(h[1].length, 4) }, content: [{ type: "text", text: h[2] }] })
    } else if (b) {
      bullets.push({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: b[1] }] }] })
    } else if (l) {
      flush()
      out.push({ type: "paragraph", content: [{ type: "text", text: l }] })
    } else {
      flush()
    }
  }
  flush()
  return out.length ? out : [{ type: "paragraph" }]
}

const PRINT_CSS = `
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.doc { max-width: 720px; margin: 0 auto; padding: 40px 32px; }
.doc-title { font-size: 26px; font-weight: 800; margin: 0 0 6px; }
.doc-meta { color: #666; font-size: 13px; margin: 0 0 24px; }
.meeting-doc { font-size: 14px; line-height: 1.7; }
.meeting-doc h1 { font-size: 22px; font-weight: 700; margin: 22px 0 10px; }
.meeting-doc h2 { font-size: 18px; font-weight: 700; margin: 20px 0 8px; }
.meeting-doc h3 { font-size: 15px; font-weight: 700; margin: 16px 0 6px; }
.meeting-doc p { margin: 8px 0; }
.meeting-doc ul, .meeting-doc ol { margin: 8px 0; padding-left: 22px; }
.meeting-doc li { margin: 3px 0; }
.meeting-doc img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; display: block; }
.meeting-doc img[data-align="center"] { margin-left: auto; margin-right: auto; }
.meeting-doc img[data-align="right"] { margin-left: auto; }
.meeting-doc table { border-collapse: collapse; width: 100%; margin: 12px 0; }
.meeting-doc th, .meeting-doc td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 13px; }
.meeting-doc th { background: #f5f5f5; font-weight: 600; }
.meeting-doc pre { background: #f5f5f5; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; }
.meeting-doc code { font-family: ui-monospace, monospace; }
.meeting-doc blockquote { border-left: 3px solid #ddd; margin: 10px 0; padding: 2px 14px; color: #555; }
.meeting-doc a { color: #2563eb; text-decoration: underline; }
.meeting-doc mark { background: #fff3a3; padding: 0 2px; }
.meeting-doc hr { border: none; border-top: 1px solid #e5e5e5; margin: 18px 0; }
@page { margin: 16mm; }
`

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)

export function MeetingEditor({
  note,
  me,
  isAdmin,
  authorName,
  authorPosition,
  onBack,
  onSaved,
  onDeleted,
}: {
  note: Note | null
  me: string
  isAdmin: boolean
  authorName?: string
  authorPosition?: string | null
  onBack: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const supabase = createClient()
  const canEdit = !note || note.user_id === me || isAdmin

  const init = useMemo(
    () => ({
      title: note?.title ?? "",
      meetingDate: note?.meeting_date ?? new Date().toLocaleDateString("en-CA"),
      attendees: note?.attendees ?? "",
      content: note?.content ?? "",
    }),
    [note]
  )

  const [title, setTitle] = useState(init.title)
  const [meetingDate, setMeetingDate] = useState(init.meetingDate)
  const [attendees, setAttendees] = useState(init.attendees)
  const [content, setContent] = useState(init.content) // 본문 HTML
  const [busy, setBusy] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const editorRef = useRef<Editor | null>(null)

  const ai = useMeetingAi(() => editorRef.current?.getText() ?? "")

  // AI 리서치(Part 2 · 2a) — 주제 입력 → 웹 검색·신뢰도 정리 → 본문 삽입.
  const [researchOpen, setResearchOpen] = useState(false)
  const [researchQuery, setResearchQuery] = useState("")
  const [researchBusy, setResearchBusy] = useState(false)
  const [researchResult, setResearchResult] = useState<{ text: string; sources: { url: string; title?: string }[]; searched: boolean } | null>(null)

  const runResearch = async () => {
    const q = researchQuery.trim()
    if (!q || researchBusy) return
    setResearchBusy(true)
    setResearchResult(null)
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 75000)
    try {
      const res = await fetch("/api/meeting-notes/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, context: editorRef.current?.getText().slice(0, 4000) ?? "" }),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error("리서치에 실패했어요.")
      setResearchResult((await res.json()) as { text: string; sources: { url: string; title?: string }[]; searched: boolean })
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
    setResearchOpen(false)
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
  const [graphData, setGraphData] = useState<{
    nodes: { id: string; label: string; group: string }[]
    links: { source: string; target: string; rel?: string }[]
  } | null>(null)

  const runGraph = async () => {
    const material = researchResult?.text.trim()
    if (!material || graphBusy) return
    setGraphBusy(true)
    try {
      const res = await fetch("/api/meeting-notes/research/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: researchQuery, material }),
      })
      if (!res.ok) throw new Error("그래프 생성에 실패했어요.")
      const data = (await res.json()) as {
        nodes: { id: string; label: string; group: string }[]
        links: { source: string; target: string; rel?: string }[]
      }
      if (data.nodes.length === 0) {
        toast.error("그래프로 만들 내용을 찾지 못했어요.")
        return
      }
      setGraphData(data)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "그래프 생성에 실패했어요.")
    } finally {
      setGraphBusy(false)
    }
  }

  useEffect(() => {
    const t = titleRef.current
    if (t) {
      t.style.height = "auto"
      t.style.height = `${t.scrollHeight}px`
    }
  }, [])

  const dirty =
    canEdit &&
    (title !== init.title || meetingDate !== init.meetingDate || attendees !== init.attendees || content !== init.content)

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [dirty])

  const handleBack = () => {
    if (dirty && !confirm("저장하지 않은 변경이 있어요. 목록으로 나갈까요?")) return
    onBack()
  }

  const sizeTitle = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    t.style.height = "auto"
    t.style.height = `${t.scrollHeight}px`
  }

  const aiAppend = () => {
    const r = ai.result?.trim()
    if (r) editorRef.current?.chain().focus("end").insertContent(linesToContent(r)).run()
    ai.close()
  }
  const aiReplace = () => {
    const r = ai.result?.trim()
    if (!r) {
      ai.close()
      return
    }
    if (editorRef.current && editorRef.current.getText().trim() && !confirm("현재 본문을 AI 결과로 덮어쓸까요? 기존 내용은 사라집니다.")) return
    editorRef.current?.commands.setContent({ type: "doc", content: linesToContent(r) })
    ai.close()
  }

  const save = async () => {
    if (!title.trim()) {
      toast.error("제목을 입력해 주세요.")
      return
    }
    setBusy(true)
    try {
      const payload = {
        title: title.trim(),
        content,
        meeting_date: meetingDate || null,
        attendees: attendees.trim() || null,
      }
      if (note?.id) {
        await mustOk(
          supabase
            .from("meeting_notes")
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq("id", note.id)
        )
        toast.success("회의록을 저장했어요.")
      } else {
        await mustOk(supabase.from("meeting_notes").insert({ ...payload, user_id: me }))
        toast.success("회의록을 만들었어요.")
      }
      onSaved()
    } catch {
      toast.error("저장에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!note?.id) return
    if (!confirm("이 회의록을 삭제할까요?")) return
    setBusy(true)
    try {
      await mustOk(supabase.from("meeting_notes").delete().eq("id", note.id))
      toast.success("삭제했어요.")
      onDeleted()
    } catch {
      toast.error("삭제에 실패했어요.")
    } finally {
      setBusy(false)
    }
  }

  // PDF 저장 — 새 창에 정리본만 렌더 → 브라우저 인쇄(PDF로 저장). 의존성 0, 한글 폰트 안전.
  const exportPdf = () => {
    const html = editorRef.current?.getHTML() ?? content
    const win = window.open("", "_blank", "width=860,height=1000")
    if (!win) {
      toast.error("팝업이 차단됐어요. 팝업 허용 후 다시 시도해 주세요.")
      return
    }
    const meta = [meetingDate, attendees].filter(Boolean).map(escapeHtml).join(" · ")
    win.document.write(
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title || "회의록")}</title><style>${PRINT_CSS}</style></head><body><main class="doc"><h1 class="doc-title">${escapeHtml(title || "제목 없음")}</h1>${meta ? `<p class="doc-meta">${meta}</p>` : ""}<div class="meeting-doc">${html}</div></main><scr` +
        `ipt>window.onload=function(){setTimeout(function(){window.focus();window.print()},300)}</scr` +
        `ipt></body></html>`
    )
    win.document.close()
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* 상단 바 */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <button onClick={handleBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 목록
        </button>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={exportPdf} title="PDF로 저장 (인쇄 → 대상을 'PDF로 저장')">
            <FileDown className="size-3.5" /> PDF
          </Button>
          {canEdit ? (
            <>
              {note?.id && (
                <Button variant="ghost" size="sm" onClick={remove} disabled={busy} className="text-destructive hover:text-destructive">
                  <Trash2 className="size-3.5" /> 삭제
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={busy}>
                {busy && <Loader2 className="size-3.5 animate-spin" />} 저장
              </Button>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              읽기 전용{authorName ? ` · ${[authorName, authorPosition].filter(Boolean).join(" · ")}` : ""}
            </span>
          )}
        </div>
      </div>

      {/* 제목 — 보더 없는 큰 텍스트 */}
      {canEdit ? (
        <textarea
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onInput={sizeTitle}
          rows={1}
          placeholder="제목 없음"
          className="w-full resize-none border-0 bg-transparent p-0 text-3xl font-bold leading-tight outline-none placeholder:text-muted-foreground/40 focus-visible:ring-0"
        />
      ) : (
        <h1 className="text-3xl font-bold leading-tight">{note?.title || "제목 없음"}</h1>
      )}

      {/* 메타 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
        {canEdit ? (
          <>
            <label className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="border-0 bg-transparent p-0 text-xs text-foreground outline-none focus-visible:ring-0"
              />
            </label>
            <label className="inline-flex min-w-0 flex-1 items-center gap-1.5">
              <Users className="size-3.5 shrink-0" />
              <input
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="참석자 추가"
                className="w-full border-0 bg-transparent p-0 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
              />
            </label>
          </>
        ) : (
          <>
            {note?.meeting_date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="size-3.5" /> {note.meeting_date}
              </span>
            )}
            {note?.attendees && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" /> {note.attendees}
              </span>
            )}
          </>
        )}
      </div>

      {/* AI 보조 — 작성하는 곳 옆에 상시 */}
      {canEdit && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Sparkles className="size-3" /> AI
            </span>
            {AI_ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => ai.run(a)}
                disabled={busy || ai.busy}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {ai.busy && ai.active === a && <Loader2 className="size-3 animate-spin" />}
                {AI_ACTION_LABEL[a]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setResearchOpen((o) => !o)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 px-2.5 py-0.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              <Search className="size-3" /> 리서치
            </button>
            <span className="text-[11px] text-muted-foreground/70">· 본문에서 <kbd className="rounded bg-muted px-1">/</kbd> 입력</span>
          </div>

          {ai.result !== null && (
            <div className="mt-2 rounded-lg border bg-muted/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {ai.active ? AI_ACTION_LABEL[ai.active] : ""} 결과 (미리보기)
                </span>
                <button onClick={ai.close} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
                  <X className="size-3.5" />
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm">
                {ai.result || <span className="text-muted-foreground">생성 중…</span>}
              </div>
              <div className="mt-2.5 flex justify-end gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={aiAppend} disabled={ai.busy || !ai.result.trim()}>
                  <Plus className="size-3.5" /> 본문에 추가
                </Button>
                <Button type="button" size="sm" onClick={aiReplace} disabled={ai.busy || !ai.result.trim()}>
                  <RefreshCw className="size-3.5" /> 전체 교체
                </Button>
              </div>
            </div>
          )}

          {researchOpen && (
            <div className="mt-2 rounded-lg border bg-muted/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Search className="size-3" /> AI 리서치 · 웹에서 자료를 모아 신뢰도로 정리
                </span>
                <button onClick={() => setResearchOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="닫기">
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
                <Button type="button" size="sm" onClick={runResearch} disabled={researchBusy || !researchQuery.trim()}>
                  {researchBusy && <Loader2 className="size-3.5 animate-spin" />} 검색
                </Button>
              </div>
              {researchResult && (
                <>
                  {!researchResult.searched && (
                    <p className="mt-2 text-[11px] text-warning">⚠️ 웹 검색 비활성 — Claude 지식 기반(최신성 한계). Anthropic 콘솔에서 web search 활성화가 필요해요.</p>
                  )}
                  <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm">{researchResult.text}</div>
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
                    <Button type="button" variant="outline" size="sm" onClick={runGraph} disabled={graphBusy}>
                      {graphBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Network className="size-3.5" />} 그래프
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
                                  <img src={c.image} alt="" loading="lazy" className="size-full object-cover" />
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
        </>
      )}

      {/* 본문 — Tiptap 블록 에디터 */}
      <div className="mt-5 min-h-[45vh]">
        <MeetingDocEditor
          value={init.content}
          editable={canEdit}
          onChange={setContent}
          editorRef={editorRef}
        />
      </div>
    </div>
  )
}
