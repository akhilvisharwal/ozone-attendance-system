import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { MyProfileSection } from "@/components/settings/MyProfileSection";
import { UserCircle } from "lucide-react";

export function EmployeeProfilePage() {
  return (
    <div>
      <PageHeader
        title="My Profile"
        subtitle="Manage your profile picture"
        icon={<UserCircle className="h-5 w-5" />}
      />
      <Card>
        <CardBody>
          <MyProfileSection />
        </CardBody>
      </Card>
    </div>
  );
}
