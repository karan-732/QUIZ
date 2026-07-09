import { QRCodeSVG } from 'qrcode.react';

export default function QRCodeCard({ joinUrl }) {
  return (
    <div className="glass flex flex-col items-center gap-4 rounded-3xl p-5 backdrop-blur-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Scan to join</p>
      {/* QR needs a white quiet zone to scan reliably from across a room */}
      <div className="rounded-2xl bg-white p-3 shadow-[0_0_40px_-10px_rgba(129,140,248,0.5)]">
        <QRCodeSVG value={joinUrl} size={176} level="M" />
      </div>
      <p className="max-w-52 break-all text-center text-xs font-medium text-slate-400">{joinUrl}</p>
    </div>
  );
}
