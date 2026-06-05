"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Upload, Contact, Loader2, Building2, Phone, Mail, UserCircle, Download } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { uploadImage } from "@/lib/upload"
import { Button } from "@/components/ui/button"
import { downloadCsv, todayStamp } from "@/lib/csv"
import { Loading, EmptyState, ErrorState } from "@/components/shared/States"
import type { BusinessCard } from "@/types"

type CardRow = BusinessCard & { owner: { name: string } | null }

export function CardsView() {
  const supabase = createClient()
  const PAGE_SIZE = 50
  const [cards, setCards] = useState<CardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [searchText, setSearchText] = useState("")
  const [pageCount, setPageCount] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from("business_cards")
        .select("*, owner:profiles!business_cards_owner_id_fkey(name)", { count: "exact" })
        .is("deleted_at", null)
      if (searchText.trim()) {
        const s = `%${searchText.trim()}%`
        q = q.or(`name.ilike.${s},company.ilike.${s},email.ilike.${s}`)
      }
      const { data, count, error: queryError } = await q
        .order("created_at", { ascending: false })
        .range(0, pageCount * PAGE_SIZE - 1)
      if (queryError) throw new Error(queryError.message)
      setCards((data as CardRow[]) ?? [])
      setTotalCount(count ?? 0)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "명함을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [supabase, searchText, pageCount])

  useEffect(() => {
    load()
  }, [load])

  // 되돌리기/다시실행으로 데이터가 바뀌면 목록 새로고침
  useEffect(() => {
    const h = () => load()
    window.addEventListener("equria:reload", h)
    return () => window.removeEventListener("equria:reload", h)
  }, [load])

  useEffect(() => {
    setPageCount(1)
  }, [searchText])

  const hasMore = cards.length < totalCount

  const exportCsv = async () => {
    let q = supabase
      .from("business_cards")
      .select("*, owner:profiles!business_cards_owner_id_fkey(name)")
      .is("deleted_at", null)
    if (searchText.trim()) {
      const s = `%${searchText.trim()}%`
      q = q.or(`name.ilike.${s},company.ilike.${s},email.ilike.${s}`)
    }
    const { data } = await q.order("created_at", { ascending: false })
    const all = (data as CardRow[]) ?? []
    const headers = ["등록일", "이름", "회사", "직책", "부서", "휴대폰", "전화", "이메일", "주소", "웹사이트", "등록자"]
    const rows = all.map((c) => [
      new Date(c.created_at).toLocaleDateString("ko-KR"),
      c.name ?? "",
      c.company ?? "",
      c.title ?? "",
      c.department ?? "",
      c.mobile ?? "",
      c.phone ?? "",
      c.email ?? "",
      c.address ?? "",
      c.website ?? "",
      c.owner?.name ?? "",
    ])
    downloadCsv(`명함_${todayStamp()}.csv`, headers, rows)
  }

  const onUpload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const path = await uploadImage("business-cards", file)
      const res = await fetch("/api/cards/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "OCR 실패")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">명함 관리</h1>
        <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={cards.length === 0}>
          <Download /> 엑셀
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {uploading ? "분석 중…" : "명함 업로드 (이미지/PDF)"}
        </Button>
        </div>
      </div>

      {/* 검색 바 */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          className="h-8 w-64 rounded-lg border border-border bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          placeholder="이름·회사·이메일 검색…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        {searchText && (
          <button className="text-xs text-muted-foreground hover:underline" onClick={() => setSearchText("")}>
            초기화
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">총 {totalCount.toLocaleString()}개</span>
      </div>

      {error && cards.length > 0 && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <Loading rows={6} />
      ) : error && cards.length === 0 ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setError(null)
            load()
          }}
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon={Contact}
          title="등록된 명함이 없습니다"
          description="명함 사진을 올리면 Claude가 자동으로 스캔·정리합니다."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.id}
              href={`/cards/${c.id}`}
              className="hover-grow flex flex-col gap-1.5 rounded-lg border p-4 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-base font-semibold">{c.name ?? "(이름 없음)"}</span>
                {c.title && <span className="text-xs text-muted-foreground">{c.title}</span>}
              </div>
              {c.company && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="size-3.5" /> {c.company}
                </span>
              )}
              {(c.mobile || c.phone) && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="size-3.5" /> {c.mobile || c.phone}
                </span>
              )}
              {c.email && (
                <span className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" /> <span className="truncate">{c.email}</span>
                </span>
              )}
              <span className="mt-1 flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
                <UserCircle className="size-3.5 shrink-0" /> 등록: {c.owner?.name ?? "—"}
              </span>
            </Link>
          ))}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setPageCount((p) => p + 1)}>
            더 보기 ({cards.length} / {totalCount})
          </Button>
        </div>
      )}
    </div>
  )
}
