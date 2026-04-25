import { BoxFieldClient } from "./box-field-client";

export default async function FieldBoxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoxFieldClient boxId={id} />;
}
