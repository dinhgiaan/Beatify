import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Copy,
  Check,
  Download,
  RefreshCw,
  Camera,
  ScanLine,
  ExternalLink,
  ShieldCheck,
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
      width: 260,
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
      description="Quét mã bằng Camera mặc định trên iPhone 16 để nhận diện và cấu hình ứng dụng tức thì."
      maxWidth="max-w-4xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch py-1 text-left">
        {/* Cột Trái (5/12): Khung mã QR Stage */}
        <div className="md:col-span-5 flex flex-col items-center justify-between p-6 rounded-2xl bg-[#141418] border border-white/10 shadow-xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Sẵn sàng kết nối qua Camera iOS</span>
          </div>

          <div className="my-4 p-3 bg-white rounded-2xl shadow-2xl border border-white/20 transition-transform duration-200 hover:scale-[1.02]">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Mã QR kết nối Beatify"
                className="w-48 h-48 rounded-xl object-contain"
              />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-zinc-400">
                <RefreshCw size={24} className="animate-spin text-zinc-400" />
              </div>
            )}
          </div>

          <div className="space-y-1 w-full">
            <div className="text-xs text-zinc-300 font-medium flex items-center justify-center gap-1.5">
              <span>Giao thức:</span>
              <span className="text-emerald-400 font-semibold">beatify://connect</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Tự động truyền URL máy chủ và mã xác thực an toàn
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadQR}
            className="mt-4 gap-2 text-xs border-white/10 hover:border-white/20 w-full"
          >
            <Download size={13} />
            <span>Tải ảnh QR về máy</span>
          </Button>
        </div>

        {/* Cột Phải (7/12): Hướng dẫn 3 bước & Cấu hình thủ công */}
        <div className="md:col-span-7 flex flex-col justify-between space-y-5">
          {/* 3 Bước thực hiện */}
          <div className="space-y-2.5">
            <h5 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone size={14} className="text-zinc-400" />
              <span>3 bước thao tác nhanh trên iPhone</span>
            </h5>

            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/10 text-white font-medium text-xs flex items-center justify-center shrink-0 mt-0.5">
                  1
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="text-white font-medium flex items-center gap-1.5">
                    <Camera size={13} className="text-zinc-400" />
                    <span>Mở ứng dụng Camera mặc định</span>
                  </div>
                  <p className="text-zinc-400 leading-relaxed text-[11.5px]">
                    Không cần cài đặt ứng dụng quét mã ngoài, chỉ cần dùng ứng dụng Camera có sẵn trên iPhone.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/10 text-white font-medium text-xs flex items-center justify-center shrink-0 mt-0.5">
                  2
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="text-white font-medium flex items-center gap-1.5">
                    <ScanLine size={13} className="text-zinc-400" />
                    <span>Hướng ống kính vào mã QR</span>
                  </div>
                  <p className="text-zinc-400 leading-relaxed text-[11.5px]">
                    Giữ camera cách màn hình khoảng 20 - 40cm cho đến khi hiện liên kết màu vàng trên khung ngắm.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-white/10 text-white font-medium text-xs flex items-center justify-center shrink-0 mt-0.5">
                  3
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="text-white font-medium flex items-center gap-1.5">
                    <ExternalLink size={13} className="text-zinc-400" />
                    <span>Chạm vào banner &quot;Mở trong Beatify&quot;</span>
                  </div>
                  <p className="text-zinc-400 leading-relaxed text-[11.5px]">
                    Ứng dụng Beatify trên iPhone sẽ tự khởi động và lưu thông tin kết nối thành công.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Form cấu hình Server & Token thủ công */}
          <div className="space-y-3 pt-4 border-t border-white/10">
            <h5 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-zinc-400" />
              <span>Thông tin máy chủ &amp; Xác thực</span>
            </h5>

            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-zinc-300 font-medium">
                    URL Server (Cloudflare Worker hoặc LAN IP)
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer text-[11px]"
                  >
                    {copiedType === 'url' ? (
                      <>
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-400">Đã copy</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiUrl(e.target.value)}
                  placeholder="Ví dụ: http://192.168.1.100:8787 hoặc domain Worker"
                  className="w-full h-9 px-3 rounded-xl border border-white/10 bg-[#16161a] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-zinc-300 font-medium">
                    Token xác thực (Bearer Token)
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer text-[11px]"
                  >
                    {copiedType === 'token' ? (
                      <>
                        <Check size={12} className="text-emerald-400" />
                        <span className="text-emerald-400">Đã copy</span>
                      </>
                    ) : (
                      <>
                        <Copy size={12} />
                        <span>Sao chép</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiToken(e.target.value)}
                  placeholder="Để trống nếu máy chủ không cài đặt token bảo mật"
                  className="w-full h-9 px-3 rounded-xl border border-white/10 bg-[#16161a] text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveConfig}
                className="text-xs px-4"
              >
                Lưu cấu hình
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
};

