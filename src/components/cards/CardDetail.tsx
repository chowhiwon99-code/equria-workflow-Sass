"use client"

import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { BackLink } from "@/components/shared/BackLink"
import type { BusinessCard } from "@/types"

const FIELDS: { key: keyof BusinessCard; label: string }[] = [
  { key: "name", label: "이름" },
  { key: "company", label: "회사" },
  { key: "title", label: "직책" },
  { key: "department", label: "부서" },
  { key: "mobile", label: "휴대폰" },
  { key: "phone", label: "전화" },
  { key: "email", label: "이메일" },
  { key: "address", label: "주소" },
  { key: "website", label: "웹사이트" },
]

type CardRow = BusinessCard & { owner: { name: string } | null }

export function CardDetail({ cardId }: { cardId: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [card, setCard] = useState<CardRow | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase
        .from("business_cards")
        .select("*, owner:profiles!business_cards_owner_id_fkey(name)")
        .eq("id", cardId)
        .single()
      setCard((data as CardRow) ?? null)
      if (data?.image_url) {
        const { data: signed } = await supabase.storage
          .from("business-cards")
          .createSignedUrl(data.image_url, 300)
        setImageUrl(signed?.signedUrl ?? null)
      }
      setLoading(false)
    })()
  }, [supabase, cardId])

  const remove = async () => {
    await supabase.from("business_cards").delete().eq("id", cardId)
    router.push("/cards")
  }

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>
  if (!card) return <p className="text-sm text-muted-foreground">명함을 찾을 수 없습니다.</p>

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/cards" label="명함 목록" />

      <p className="text-sm text-muted-foreground">
        등록: <span className="font-medium text-foreground">{card.owner?.name ?? "—"}</span>
        <span className="mx-1.5">·</span>
        {new Date(card.created_at).toLocaleDateString("ko-KR")}
      </p>

      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="명함" className="max-h-56 w-fit rounded-lg border object-contain" />
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {FIELDS.map(({ key, label }) => {
          const value = card[key] as string | null
          if (!value) return null
          return (
            <div key={key} className="flex flex-col gap-0.5 border-b py-1.5">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-sm">{value}</span>
            </div>
          )
        })}
      </div>

      <div>
        <Button variant="destructive" size="sm" onClick={remove}>
          <Trash2 /> 삭제
        </Button>
      </div>
    </div>
  )
}
