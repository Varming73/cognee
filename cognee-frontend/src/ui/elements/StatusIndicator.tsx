import type { DatasetStatus } from "@/types/api";

interface StatusIndicatorProps {
  status?: DatasetStatus;
}

export default function StatusIndicator({ status }: StatusIndicatorProps) {
  const statusConfig = {
    DATASET_PROCESSING_STARTED: {
      color: "#ffd500",
      label: "Processing",
      ariaLabel: "Dataset processing started",
    },
    DATASET_PROCESSING_INITIATED: {
      color: "#ffd500",
      label: "Processing",
      ariaLabel: "Dataset processing initiated",
    },
    DATASET_PROCESSING_COMPLETED: {
      color: "#53ff24",
      label: "Completed",
      ariaLabel: "Dataset processing completed successfully",
    },
    DATASET_PROCESSING_ERRORED: {
      color: "#ff5024",
      label: "Error",
      ariaLabel: "Dataset processing failed with error",
    },
  };

  const config = status ? statusConfig[status as keyof typeof statusConfig] : null;
  const displayColor = config?.color || "#808080";
  const ariaLabel = config?.ariaLabel || "Status unknown";
  const title = config?.label || "Unknown";

  return (
    <div
      role="status"
      aria-label={ariaLabel}
      title={title}
      style={{
        width: "16px",
        height: "16px",
        borderRadius: "4px",
        background: displayColor,
      }}
    />
  );
}
