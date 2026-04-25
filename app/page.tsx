import { redirect } from "next/navigation";

// La ruta raíz nunca debe alcanzarse: middleware re-escribe a /marketing, /platform, /super-admin o /t/*.
// Como red, redirigimos a marketing.
export default function Root() {
  redirect("/marketing");
}
