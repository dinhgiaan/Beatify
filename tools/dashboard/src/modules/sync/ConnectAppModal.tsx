import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Copy,
  Check,
  Download,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '../../ui/organisms/Dialog';
import { Button } from '../../ui/atoms/Button';

interface ConnectAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectAppModal: React.FC<ConnectAppModalProps> = ({ isOpen, onClose }) => {
  // Lấy cấu hình đã lưu trong localStorage hoặc giá trị mặc định
  const [apiUrl, setApiUrl] = useState<string>(() => {
    return localStorage.getItem('beatify_mobile_api_url') || 'http://127.0.0.1:8787';
  });
  const [apiToken, setApiToken] = useState<string>(() => {
    return localStorage.getItem('beatify_mobile_api_token') || '';
  });
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedType, setCopiedType] = useState<'url' | 'token' | null>(null);

  // Sinh payload deep link cho app iPhone
  const deepLink = React.useMemo(() => {
    const cleanUrl = apiUrl.trim().replace(/\/+$/, '');
    const cleanToken = apiToken.trim();
    return `beatify://connect?api=${encodeURIComponent(cleanUrl)}&token=${encodeURIComponent(cleanToken)}`;
  }, [apiUrl, apiToken]);

  // Sinh ảnh QR khi thay đổi cấu hình
  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(deepLink, {
      width: 280,
      margin: 1.5,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url: string) => setQrDataUrl(url))
      .catch((err: unknown) => {
        console.error('Lỗi sinh mã QR:', err);
      });
  }, [deepLink, isOpen]);

  const handleSaveConfig = () => {
    localStorage.setItem('beatify_mobile_api_url', apiUrl.trim());
    localStorage.setItem('beatify_mobile_api_token', apiToken.trim());
    toast.success('Đã lưu cấu hình kết nối');
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(apiUrl.trim());
    setCopiedType('url');
    toast.success('Đã sao chép URL Server');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(apiToken.trim());
    setCopiedType('token');
    toast.success('Đã sao chép Token xác thực');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'beatify-connect-qr.png';
    a.click();
    toast.success('Đã tải ảnh mã QR về máy');
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Kết nối App iPhone với Beatify"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-left py-1">
        {/* Banner giới thiệu */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <Smartphone size={20} />
          </div>
          <div className="space-y-0.5 text-xs">
            <h4 className="font-bold text-white text-sm tracking-tight flex items-center gap-1.5">
              <span>Quét mã QR bằng Camera iPhone để kết nối tức thì</span>
              <Sparkles size={14} className="text-emerald-400" />
            </h4>
            <p className="text-zinc-300 leading-relaxed text-[11.5px]">
              Bạn không cần phải nhìn màn hình máy tính để gõ từng ký tự token trên điện thoại.
              Chỉ cần mở camera mặc định trên iPhone 16 quét mã QR này là app sẽ tự nhận diện và kết nối!
            </p>
          </div>
        </div>

        {/* Nội dung 2 cột: Cột trái QR Code, Cột phải Cấu hình & Hướng dẫn */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
          {/* Cột Trái: Khung mã QR */}
          <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-[#16161a] border border-white/10 space-y-3 text-center shadow-xl">
            <div className="relative p-2.5 bg-white rounded-2xl shadow-lg border-2 border-emerald-500/30">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Mã QR kết nối Beatify"
                  className="w-52 h-52 rounded-xl object-contain"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-zinc-400">
                  <RefreshCw size={24} className="animate-spin text-emerald-400" />
                </div>
              )}
            </div>

            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-white tracking-tight">
                Mã kết nối chuẩn: Deep Link <code className="text-emerald-400 font-mono text-[11px]">beatify://</code>
              </span>
              <p className="text-[11px] text-zinc-400">
                Chứa đầy đủ Server URL và Token bảo mật
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadQR}
              className="gap-1.5 text-xs"
            >
              <Download size={13} />
              <span>Tải ảnh QR về máy</span>
            </Button>
          </div>

          {/* Cột Phải: Các bước thao tác & Cấu hình Server */}
          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <h5 className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                3 bước thực hiện trên iPhone:
              </h5>
              <ol className="space-y-1.5 text-[11.5px] text-zinc-300 list-decimal list-inside leading-relaxed bg-white/[0.03] p-2.5 rounded-xl border border-white/5">
                <li>
                  Mở ứng dụng <strong>Camera mặc định</strong> trên iPhone 16.
                </li>
                <li>
                  Hướng camera vào mã QR ở khung bên cạnh.
                </li>
                <li>
                  Nhấn vào thông báo vàng <strong>"Mở trong Beatify"</strong> xuất hiện trên màn hình để kết nối tự động.
                </li>
              </ol>
            </div>

            {/* Cấu hình URL & Token (nếu muốn chỉnh sửa hoặc copy thủ công) */}
            <div className="space-y-2.5 pt-2 border-t border-white/10">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                  <span>URL Server (Cloudflare Worker hoặc LAN IP)</span>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer text-[10.5px]"
                  >
                    {copiedType === 'url' ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedType === 'url' ? 'Đã copy' : 'Copy'}</span>
                  </button>
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiUrl(e.target.value)}
                  placeholder="https://api.yourdomain.workers.dev"
                  className="w-full h-8 px-2.5 rounded-lg border border-white/10 bg-[#16161a] text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                  <span>Token xác thực (Bearer Token)</span>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer text-[10.5px]"
                  >
                    {copiedType === 'token' ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedType === 'token' ? 'Đã copy' : 'Copy'}</span>
                  </button>
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiToken(e.target.value)}
                  placeholder="Nhập token bảo mật nếu có"
                  className="w-full h-8 px-2.5 rounded-lg border border-white/10 bg-[#16161a] text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveConfig}
                  className="text-xs"
                >
                  Lưu cấu hình
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
