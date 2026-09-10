# Merly TikTok Live Clip Downloader

Extension nội bộ để quét và tải hàng loạt clip live teaser trên TikTok Seller và clip tại trang LIVE Highlights.

## Cài đặt trên Chrome / Edge

1. Giải nén file ZIP này.
2. Mở `chrome://extensions` hoặc `edge://extensions`.
3. Bật `Developer mode` / `Chế độ nhà phát triển`.
4. Chọn `Load unpacked` / `Tải tiện ích đã giải nén`.
5. Chọn thư mục `merly_tiktok_clip_downloader_v01` sau khi giải nén.

## Cách dùng

1. Mở một trong hai trang được hỗ trợ:
   - TikTok Seller: `LIVE và video` → `Bán hàng qua LIVE` / trang teaser clip.
   - TikTok Shop LIVE Highlights: `https://shop.tiktok.com/streamer/live/highlights`.
2. Reload lại trang sau khi cài extension.
3. Tại LIVE Highlights, bấm `Quét toàn bộ` để extension tự cuộn và nạp toàn bộ danh sách.
4. Nếu vẫn còn clip chưa bắt được link, bấm play clip đó rồi quét lại.
5. Nhìn bảng `Merly TikTok Clips` ở góc dưới phải.
6. Bấm `Quét trang`.
7. Bấm `Tải tất cả`.

Video sẽ được tải về thư mục Downloads, trong folder dạng:

`Merly_TikTok_Live_YYYY-MM-DD`

## Lưu ý

- Link video TikTok có thời hạn, nên quét xong tải ngay.
- Bản 0.2.1 kiểm tra Content-Type trước khi tải và tự bỏ link JSON/TXT hoặc link hết hạn.
- Chỉ dùng với clip thuộc quyền quản lý của shop mình.
- Nếu Chrome hỏi cho phép tải nhiều file, chọn `Allow`.
- Nếu bảng chưa hiện clip, hãy bấm play từng clip rồi quét lại.
