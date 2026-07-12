import { redirect } from "next/navigation";
import { getServerUser } from "@/core/db";
import { TasksPage } from "@/features/tasks/components/tasks-page";

export default async function TasksRoute() {
	const { user } = await getServerUser();
	if (!user) redirect("/app");
	return <TasksPage />;
}
