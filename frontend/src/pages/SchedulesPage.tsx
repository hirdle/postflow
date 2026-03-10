import { PlaceholderCard } from "../components/PlaceholderCard";

export function SchedulesPage() {
  return (
    <PlaceholderCard
      title="Schedules placeholder"
      description="Роут `/schedules` уже есть. Следом сюда подключится таблица запланированных публикаций и действия cancel/reschedule."
      items={[
        "List scheduled posts via GET /api/schedules",
        "Cancel with confirmation",
        "Reschedule with date and time picker",
      ]}
    />
  );
}
