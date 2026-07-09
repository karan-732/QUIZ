import { QRCodeSVG } from 'qrcode.react';

export default function QRCodeCard({ joinUrl }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="rounded-xl bg-white p-3">
        <QRCodeSVG value={joinUrl} size={176} level="M" />
      </div>
      <p className="max-w-[200px] break-all text-center text-xs text-slate-400">{joinUrl}</p>
    </div>
  );
}
