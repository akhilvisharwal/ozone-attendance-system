import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { MyProfileSection } from "@/components/settings/MyProfileSection";
import { UserCircle } from "lucide-react";

export function EmployeeProfilePage() {
  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden pb-2">
      <PageHeader
        title="My Profile"
        subtitle="Manage your profile picture and notification preferences"
        icon={<UserCircle className="h-5 w-5" />}
      />
      <Card className="min-w-0 overflow-hidden">
        <CardBody>
          <MyProfileSection />
        </CardBody>
      </Card>
    </div>
  );
}
