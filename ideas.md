# แผนการพัฒนา Web-based AI IDE (Hybrid: Vim + VS Code)

เอกสารนี้รวบรวมข้อกำหนด สถาปัตยกรรม และฟีเจอร์หลักสำหรับการพัฒนา Web IDE ที่ออกแบบมาเพื่อรองรับยุคเรืองรองของ AI แบบอัตโนมัติ

## 1. แก่นของระบบ (Core Concept)
เป้าหมายของโปรเจคคือการสร้าง "Code Editor แห่งอนาคต" ที่เข้าถึงได้พริบตาผ่านหน้าเว็บ และสามารถติดตั้งเป็นแอป (Desktop App) สำหรับ Mac และ Windows ได้ โดยชูจุดเด่นเรื่องการทำงานร่วมกับ AI Agents หลายตัวได้อย่างอิสระ ทรงประสิทธิภาพ และมีการผสานประสบการณ์ใช้งานที่สามารถปรับเปลี่ยนรูปโฉมได้ตามแต่สไตล์และความถนัดของผู้พัฒนาในเวลานั้น

## 2. ฟีเจอร์หลัก (Key Features)

### 2.1 Hybrid Interface (การสลับโหมดอย่างไร้รอยต่อ)
รองรับทั้งสไตล์ของ "Neovim" และ "VS Code" ในตัวเดียว พร้อมปุ่มลัดสลับร่างแบบทันที (เช่น กด `Cmd/Ctrl + Alt + V` หรือ `Cmd/Ctrl + Shift + V`)
- **VS Code Mode:** เปิดเผยหน้าแปลนเต็มรูปแบบ มีแถบเมนูด้านข้าง (Explorer, Source Control, Extensions) มี Minimap และใช้ UI ที่เป็นมิตรกับเมาส์ตามปกติ
- **Vim Mode (Zen Mode):** เมื่อกดสลับ ระบบจะซ่อนส่วนที่ไม่จำเป็นออกทั้งหมดด้วย Animation ที่ลื่นไหล ให้เหลือเพียง Editor เนื้อหาล้วนๆ พับ UI ทั้งหมดทิ้ง และคล้องการบังคับเข้ากับคีย์บอร์ดทั้งหมด (รวมถึงการทำ Window splitting, Buffer management) ด้วยระบบคีย์ลัดฉบับ Neovim

### 2.2 Multi-Agent AI Terminal
Terminal ไม่ได้แค่พิมพ์คำสั่ง Shell ปกติ แต่ถูกอัปเกรดเป็น **"ศูนย์บัญชาการ AI"** (AI Command Center)
- **อิสระแห่งตัวเลือก (Multiple Agents):** สามารถส่งงานให้ Agent แต่ละตัว (เช่น Cline, Claude Code, CodeX, Copilot CLI) ทำงานแยกหน้าต่างกันได้
- **AI Context Awareness:** Agent ที่รันบนหน้าต่างเหล่านั้น จะถูกป้อนข้อมูลสถานะปัจจุบันให้ล่วงหน้า เช่น เห็นว่าเปิดไฟล์ไหนอยู่ โปรเจคมีโครงสร้างอย่างไร หรือบรรทัดนี้ Linter ด่าว่าอะไรอยู่ (ผ่าน System Prompting ฉบับพิเศษสำหรับ IDE)
- **Smart Apply (One-click Apply):** เมื่อฝั่ง AI ผลิตโค้ดออกมาใน Terminal จะสามารถคลิกยอมรับผ่านปุ่ม "Apply Code / Diff View" เพื่อนำไปอัปเดตไฟล์จริงแบบทันทีได้เลย

### 2.3 Browser & Local Environment Execution (Code Execution)
- **การรันโค้ดฝั่งเว็บเบราว์เซอร์:** อาศัยเทคโนโลยีฝั่ง **WebContainers** (แบบที่เบื้องหลัง StackBlitz ใช้งาน) ทำให้สามารถจำลอง Node.js เพื่อรันเว็บหรือรันสคริปต์ได้โดยตรงผ่าน Browser ล้วนๆ ทันที ไม่ต้องพึ่งพาเซิร์ฟเวอร์แยก
- **การรันรหัสฝั่ง Desktop (Mac/Windows):** เข้าถึงไฟล์และทรัพยากรบนเครื่อง รองรับสถาปัตยกรรม Native / Language Servers ทำให้รันภาษาหนักๆ ได้ทุกตระกูล เช่น Python, Java, C++, Rust แบบเต็มประสิทธิภาพ

### 2.4 Smart Startup Sequence (ระบบเปิดงานอัตโนมัติ)
ระบบตั้งค่า Config อัจฉริยะ (เช่น `.ide-startup.yaml` ไว้ที่โฟลเดอร์ Root) ทำให้ผู้ใช้หรือ AI ลำดับขั้นตอนการเตรียมความพร้อมเมื่อเปิดโปรเจคได้อย่างอัตโนมัติ ตัวอย่างเช่น:
```yml
startup:
  - action: "open_files"
    files: ["src/index.tsx", "README.md"]
  - action: "set_mode"
    mode: "vs_code"
  - action: "run_terminal"
    commands:
      - title: "Frontend Server"
        cmd: "npm install && npm run dev"
      - title: "Database"
        cmd: "docker-compose up -d"
      - title: "Cline AI Agent"
        cmd: "cline start"
```

## 3. สถาปัตยกรรมทางเทคโนโลยี (Tech Stack Recommendation)

- **Frontend / UI System:** `React` หรือ `Next.js` แนะนำพร้อม `Tailwind CSS` เป็นแกนหลักของการสร้างรูปลักษณ์ ร่วมด้วย `Framer Motion` จัดการเรื่องแอนิเมชันให้เนียนตา
- **Editor Engine:** `Monaco Editor` ระบบ Core เดียวกับของ VS Code ซึ่งกินทรัพยากรรับได้ พร้อมอัปเกรด Extension รองรับการจำลองกลไกแบบ Vim (Vim Keybindings)
- **Terminal Emulator:** `xterm.js` จัดการหน้าต่างคอมมานด์ รองรับ WebSockets ส่งกระแสข้อมูลไปกลับหา AI Backend และ Shell
- **Cross-Platform Wrapper:** `Tauri (Rust)` เลือกใช้เพื่อแพ็คเป็นแอปลง Mac และ Windows เนื่องจากจะรีดประสิทธิภาพและกินแรมน้อยกว่า Electron อย่างเห็นได้ชัด แถม Rust มีประสิทธิภาพรองรับการรันสคริปต์พื้นหลังได้ดี
- **Containerization (รันโค้ดบนเบราว์เซอร์):** นำ API ของ `WebContainers` มาบูรณาการ

## 4. แผนและการพัฒนาในก้าวต่อไป (Next Steps)
1. ติดตั้งสภาพแวดล้อมระบบ (Tauri + React/Next.js Scaffold)
2. สร้างหน้าต่างการแสดงผล Editor Component โดยนำ Monaco Editor เข้ามาเสียบปลั๊ก พร้อมลองเขียนสคริปต์สลับหน้าจอ (Toggle Mode)
3. พัฒนาหน้าต่าง Terminal (Xterm.js) พร้อมสร้าง Shell เลียนแบบการใช้งานพื้นฐาน
4. ทำระบบเชื่อมต่อ AI Agents ไปยังระบบ Terminal
5. Implement ระบบอ่านไฟล์ตั้งค่า Smart Startup (`.ide-startup.yaml`)
