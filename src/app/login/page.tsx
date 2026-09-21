import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ORG_NAME } from "@/lib/constants";
import { getCurrentUser } from "@/server/authorization";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-2xl font-bold tracking-tight">{ORG_NAME}</h1>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
