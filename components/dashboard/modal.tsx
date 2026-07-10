"use client";

import { XIcon } from "@/components/landing/icons";
import { useEffect, useRef } from "react";

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="glass-card m-auto w-full max-w-lg bg-white! p-0 text-zinc-900 backdrop:bg-black/40 backdrop:backdrop-blur-md dark:bg-[#17111f]! dark:text-zinc-100"
    >
      <div className="no-scrollbar max-h-[85vh] overflow-y-auto p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2
            id="modal-title"
            className="text-base font-semibold text-zinc-900 dark:text-white"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
