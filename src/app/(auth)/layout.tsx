export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Complow 워크스페이스
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complow 직원 전용 워크스페이스
        </p>
      </div>
      {children}
    </div>
  )
}
