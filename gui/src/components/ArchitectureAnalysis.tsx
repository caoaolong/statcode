import { Brain, Sparkles, GitBranch, Boxes } from "lucide-react";

export default function ArchitectureAnalysis() {
  return (
    <div className="max-w-2xl mx-auto mt-12">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">架构分析</h2>
        <p className="text-[var(--text-muted)]">
          AI 驱动的项目架构分析，深度理解代码结构和依赖关系
        </p>
      </div>

      {/* Coming Soon Card */}
      <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] overflow-hidden">
        <div className="p-12 flex flex-col items-center text-center">
          <div className="relative mb-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-500/20 dark:to-purple-500/20 flex items-center justify-center">
              <Brain size={36} className="text-indigo-600 dark:text-indigo-300" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <Sparkles size={16} className="text-amber-600 dark:text-amber-300" />
            </div>
          </div>

          <h3 className="text-xl font-bold text-[var(--text-primary)] mb-3">
            即将推出
          </h3>
          <p className="text-[var(--text-muted)] max-w-md mb-8 leading-relaxed">
            我们正在开发基于 AI 的架构分析功能，将为您提供项目代码的深度洞察。
          </p>

          {/* Feature Preview */}
          <div className="grid grid-cols-2 gap-4 w-full max-w-md">
            <FeaturePreview
              icon={GitBranch}
              label="依赖分析"
              desc="模块间依赖关系图"
            />
            <FeaturePreview
              icon={Boxes}
              label="架构评估"
              desc="代码质量与架构评分"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeaturePreview({
  icon: Icon,
  label,
  desc,
}: {
  icon: React.ElementType;
  label: string;
  desc: string;
}) {
  return (
    <div className="p-4 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-subtle)]">
      <Icon size={20} className="text-indigo-500 dark:text-indigo-400 mb-2" />
      <p className="text-sm font-medium text-[var(--text-secondary)]">{label}</p>
      <p className="text-xs text-[var(--text-faint)] mt-1">{desc}</p>
    </div>
  );
}
