/**
 * src/modules/assets/scan-contract.ts
 *
 * PRODUCTION-READY INTEGRATION POINT — no malware scanner is connected
 * in this environment. Every uploaded FileAssetVersion is created with
 * `scanStatus: PENDING` and this function resolves it. Real options to
 * wire in later: an S3-event-triggered Lambda running ClamAV, the
 * VirusTotal API, or AWS's native S3 Malware Protection (GuardDuty).
 *
 * Until one is connected, this ALWAYS resolves to SKIPPED — never CLEAN.
 * Returning CLEAN would assert a scan actually happened, which is
 * exactly the "never claim simulated functionality is real" rule this
 * project holds to.
 */

export interface MalwareScanRequest {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
}

export interface MalwareScanResult {
  status: "CLEAN" | "INFECTED" | "SKIPPED";
  scannedAt: string;
  scannerName?: string;
}

const SCANNER_CONNECTED = false as boolean;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept to document the real function's signature; the SKIPPED stub branch below doesn't need it
export async function resolveScanStatus(_request: MalwareScanRequest): Promise<MalwareScanResult> {
  if (!SCANNER_CONNECTED) {
    return { status: "SKIPPED", scannedAt: new Date().toISOString() };
  }
  // Real scanner call goes here once SCANNER_CONNECTED is flipped to true.
  throw new Error("No malware scanner implementation is wired up yet.");
}
