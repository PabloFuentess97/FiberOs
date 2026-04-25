import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import QRCode from "qrcode";

export interface LabelBox {
  code: string;
  shortId: string;
  type: string;
  address: string | null;
  lat: number;
  lng: number;
  qrUrl: string; // URL que codifica el QR
}

export interface LabelBranding {
  displayName: string;
  primaryColor: string;
  supportEmail?: string | null;
}

export type LabelFormat = "A4" | "small";

const styles = StyleSheet.create({
  a4page: { padding: 36, fontFamily: "Helvetica" },
  smallPage: { padding: 10, fontFamily: "Helvetica" },
  grid: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: {
    width: "48%",
    minHeight: 220,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "solid",
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: 700 },
  mono: { fontFamily: "Courier", fontSize: 11 },
  muted: { color: "#64748B", fontSize: 9 },
  small: { fontSize: 9 },
  qr: { width: 120, height: 120, marginTop: 8, marginBottom: 8 },
  brandBar: { height: 6, borderRadius: 3, marginBottom: 6 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", marginTop: 2 },
  label: { fontSize: 9, color: "#64748B", width: 60 },
});

/** Genera PNG base64 del QR para incrustar en PDF. */
export async function qrPngDataUrl(url: string, size = 400): Promise<string> {
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    width: size,
    margin: 1,
    color: { dark: "#0F172A", light: "#FFFFFF" },
  });
}

/** Documento para imprimir etiquetas en A4 (8 por página). */
export function LabelsDocument({
  boxes,
  branding,
  qrDataByShort,
  format,
}: {
  boxes: LabelBox[];
  branding: LabelBranding;
  qrDataByShort: Record<string, string>; // shortId → data URL PNG
  format: LabelFormat;
}) {
  if (format === "small") {
    // Etiqueta individual 62×62 mm (impresora térmica Brother/Dymo)
    const b = boxes[0];
    if (!b) return <Document />;
    return (
      <Document>
        <Page size={[176, 176]} style={styles.smallPage}>
          <View style={[styles.brandBar, { backgroundColor: branding.primaryColor }]} />
          <Text style={[styles.title, { fontSize: 12 }]}>{b.code}</Text>
          <Text style={styles.mono}>{b.shortId}</Text>
          <Image src={qrDataByShort[b.shortId]} style={{ width: 96, height: 96, alignSelf: "center" }} />
          <Text style={styles.small}>{branding.displayName}</Text>
        </Page>
      </Document>
    );
  }

  // A4: 2 columnas × 4 filas
  return (
    <Document>
      <Page size="A4" style={styles.a4page}>
        <View style={styles.header}>
          <Text style={styles.title}>{branding.displayName} · Etiquetas</Text>
          <Text style={styles.muted}>{new Date().toLocaleDateString("es-ES")}</Text>
        </View>
        <View style={[styles.brandBar, { backgroundColor: branding.primaryColor, marginTop: 6 }]} />

        <View style={styles.grid}>
          {boxes.map((b) => (
            <View key={b.shortId} style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>{b.code}</Text>
                <Text style={styles.mono}>{b.shortId}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Tipo</Text>
                <Text style={styles.small}>{b.type}</Text>
              </View>
              {b.address ? (
                <View style={styles.row}>
                  <Text style={styles.label}>Dirección</Text>
                  <Text style={styles.small}>{b.address}</Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <Text style={styles.label}>GPS</Text>
                <Text style={styles.small}>
                  {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
                </Text>
              </View>
              <Image src={qrDataByShort[b.shortId]} style={styles.qr} />
              <Text style={styles.muted}>{b.qrUrl}</Text>
              {branding.supportEmail ? (
                <Text style={styles.muted}>Soporte: {branding.supportEmail}</Text>
              ) : null}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
