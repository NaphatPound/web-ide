import { motion } from "framer-motion";
import Layout from "./components/Layout";
import { useModeHotkey } from "./hooks/useModeHotkey";
import { useStartupConfig } from "./hooks/useStartupConfig";
import { useIdeStore } from "./store/useIdeStore";

export default function App() {
  useModeHotkey();
  useStartupConfig();
  const mode = useIdeStore((s) => s.mode);
  return (
    <div className="h-full relative" data-mode={mode}>
      <Layout />
      <motion.div
        key={mode}
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-ide-bg"
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />
    </div>
  );
}
