# เปิดพรีวิวลิงก์เป็นชื่อไฟล์

ฟังก์ชันนี้ทำให้แอปแชตอ่านชื่อไฟล์จริงจาก Supabase และไม่ส่งรูป `og:image`

## Deploy ด้วย Supabase CLI

เปิด PowerShell ในโฟลเดอร์เว็บ แล้วรัน:

```powershell
supabase login
supabase link --project-ref khvbvnpiifhbekqdtldm
supabase secrets set SITE_URL=https://theaudiovault.onrender.com
supabase functions deploy bright-endpoint --no-verify-jwt
```

ต้องใช้ `--no-verify-jwt` เพราะบอตพรีวิวของแอปแชตไม่ได้ล็อกอินและไม่มี JWT

หลัง Deploy สำเร็จ ให้อัปโหลด `script.js`, `index.html`, `list.html`, `comm.html` และ `about.html` เวอร์ชันล่าสุดขึ้นเว็บ จากนั้นแชร์ลิงก์ใหม่อีกครั้ง แอปแชตอาจเก็บพรีวิวลิงก์เก่าไว้ในแคช จึงมีพารามิเตอร์เวอร์ชันใหม่ในลิงก์ให้อัตโนมัติ
