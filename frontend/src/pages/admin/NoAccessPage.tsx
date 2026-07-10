import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

export function NoAccessPage() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <PageHeader
        title="No permissions assigned"
        subtitle="Your Junior Admin account does not have access to any modules yet."
      />
      <Card className="p-6 text-sm text-slate-600">
        Contact the Master Admin to enable permissions for your account. Permissions refresh
        automatically when you return to this tab; you can also sign out and sign back in.
      </Card>
    </div>
  );
}
