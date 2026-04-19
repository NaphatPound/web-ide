# Web-based AI IDE Development Plan

เอกสารนี้รวบรวมแผนการรันโปรเจคการพัฒนาแอปพลิเคชันรูปแบบ Hybrid IDE (รองรับการใช้งานแบบ Vim และ VS Code Mode) ควบรวมการทำงานเปิดหน้าต่าง Agent/Terminal AI และการรันแบ็กเอนด์แบบ Cross-platform โดยแบ่งออกเป็นแต่ละเฟสเพื่อใช้เป็นแนวทาง (Blueprint/Task Checklist) ในการให้ AI Agent ช่วยสานต่อการการสร้างโปรเจคทีละสเต็ปได้อย่างราบรื่น

## Tech Stack
- **Frontend OS Wrapper:** Tauri (Rust) สำหรับแอป Mac/Windows
- **Frontend / UI:** React + Vite + TypeScript (พร้อม Tailwind CSS และ Framer Motion)
- **Editor Engine:** Monaco Editor (`@monaco-editor/react`, `monaco-vim`)
- **Terminal System:** XTerm.js
- **Browser Execution:** WebContainers API (สำหรับรัน Node.js ฝั่งเว็บบราวเซอร์)

---

## 📋 Task Checklist & Execution Plan

### Phase 1: Project Scaffolding & Setup
- [ ] รันคำสั่ง `create-tauri-app` แบบล้ำยุคเพื่อวางโครง React + Vite + TypeScript ในโฟลเดอร์รันโปรเจค
- [ ] ติดตั้งแพ็คเกจเสริมสำหรับสไตล์ลิสต์: `tailwindcss`, `postcss`, `autoprefixer`, และ `framer-motion` แล้วจัดการ Config ของ Tailwind CSS ให้เรียบร้อย
- [ ] สร้างโครงสร้างไฟล์และแฟ้มพื้นฐาน (`src/components`, `src/hooks`, `src/store`, `src/utils`)
- [ ] สร้าง Layout เบื้องต้นแบบตัวหน้าว่างๆ ประกอบด้วย `Sidebar`, `EditorArea`, และ `TerminalPanel` (จัด Flexbox / CSS Grid พื้นฐาน)

### Phase 2: Editor Integration (Monaco & Modes)
- [ ] ติดตั้งแพ็คเกจ `@monaco-editor/react` (ตัว Editor กลางของระบบ)
- [ ] นำ Monaco Editor มาเสียบประกอบลงเป็นเนื้อหาใน Component `EditorArea` พร้อมตั้ง Theme และ Languages ขี้เกียจพื้นฐาน
- [ ] สร้างระบบจัดการสถานะของแอพรอบด้าน (Global State) เพื่อกำหนดโหมด (Mode) ว่าเป็น `vs_code` หรือ `vim` 
- [ ] ระบุแป้นบังคับ (`Cmd/Ctrl + Alt + V` หรือ `Cmd/Ctrl + Shift + V`) เพื่อเป็นตัวเปิดตลับฟังก์ชันสลับหน้าต่าง UI ซ่อนแถบทั้งหมดพร้อมแสดง Animation แลกเปลี่ยนแบบลื่นๆ จาก Framer Motion
- [ ] ติดตั้งและประยุกต์ส่วนขยาย `monaco-vim` ลงไป เมื่อสถานะโหมดเปลี่ยนไปเป็น Vim เพื่อใช้ Keybindings บังคับเสมือน Neovim จริง

### Phase 3: AI Multi-Terminal (Xterm.js)
- [ ] ติดตั้งหน้าต่างคำสั่งชุด Terminal (`xterm`, `xterm-addon-fit`, `xterm-addon-web-links`)
- [ ] สร้างและออกแบบระบบ `Terminal Component` ที่สามารถเปิดเพิ่มหลายแท็บได้ (Tab Management) แยก Agent ใคร Agent มันได้
- [ ] เชื่อมระบบสั่งการจริงเข้ากับ Native Backend (Rust ของ Tauri) เพื่อทำหน้าที่รับส่งข้อมูลประมวลผล PTY (pseudo-terminal) ไปออกหน้า Terminal ของ React 
- [ ] สร้างตัวจัดการคอนเท็กซ์ (Context Manager) พัฒนาระบบ API ภายในเพื่อคอยดึงตำแหน่งไฟล์และเนื้อหาโค้ดส่งไปพ่วงคำสั่งให้ AI ใน Terminal รับทราบข้อมูลบริบทรอบด้าน

### Phase 4: Project Configuration & Automation
- [ ] พัฒนาคำสั่ง Rust ให้รันและรออ่านไฟล์สคริปต์สแกนตั้งค่าเริ่มต้น `.ide-startup.yaml` ทันที หากไฟล์นี้มีอยู่ ณ แฟ้ม Root
- [ ] สร้างระบบ Automation ประมวลผลจากคอนฟิกเบื้องต้นด้านบน ให้แอปสามารถเริ่มกระบวนการสลับโหมด, เปิดไฟล์ขึ้น Editor, และสั่งรัน Terminal AI/Background Service ควบขนานกันอย่างอัตโนมัติเมื่อเปิดโปรเจค
- [ ] ทดสอบประสิทธิภาพระบบ UI/UX ของตัวแอป ทั้งในโหมดเปิดบนบราวเซอร์และแอปพลิเคชัน Desktop
