import StarterKit from "@tiptap/starter-kit"
import type { JSONContent } from "@tiptap/react"

/**
 * 채팅용 Tiptap 확장 SSOT — 에디터(RichComposer)가 사용하는 확장 셋.
 * 문서 편집기가 아니라 메신저이므로 heading/blockquote/codeBlock/horizontalRule은 끈다.
 * 남기는 서식: 굵게·기울임·취소선·밑줄·인라인코드·글머리/번호 목록·링크.
 *
 * ⚠️ 여기서 켠 노드/마크 종류는 MessageBody.tsx 렌더러가 처리하는 종류와 1:1로 맞춰야 한다.
 *    (확장을 추가하면 렌더러에도 케이스를 추가할 것 — 안 그러면 "보이지만 저장 안 보임" 꼬임)
 * placeholder는 컴포저 전용 관심사라 여기 두지 않고 RichComposer에서 더한다.
 */
export const CHAT_EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
    },
  }),
]

export type { JSONContent }
