import { SettingsView } from "@/components/settings/SettingsView"

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">설정</h1>
        <p className="text-sm text-muted-foreground">프로필·화면 테마·계정을 관리합니다.</p>
      </div>
      <SettingsView />
    </div>
  )
}
