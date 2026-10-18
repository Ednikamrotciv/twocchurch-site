declare module "*.css";

declare module "qrcode-generator" {
  interface QRCodeInstance {
    addData(data: string): void;
    make(): void;
    createSvgTag(cellSize?: number, margin?: number): string;
    createDataURL(cellSize?: number, margin?: number): string;
  }
  function QRCode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QRCodeInstance;
  export default QRCode;
}
