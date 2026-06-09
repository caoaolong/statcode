import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  FileCode,
  Layers,
  HardDrive,
  ArrowUpDown,
  TrendingUp,
} from "lucide-react";
import { useProject } from "../context/ProjectContext";
import {
  formatBytes,
  formatLines,
  formatPercent,
  getExtColor,
  CHART_COLORS,
} from "../lib/utils";

export default function CodeAnalysis() {
  const { analysisResult, isAnalyzing, error } = useProject();

  const pieData = useMemo(() => {
    if (!analysisResult) return [];
    return analysisResult.by_type.slice(0, 12).map((item, i) => ({
      name: `.${item.extension}`,
      value: item.total_lines,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [analysisResult]);

  const barData = useMemo(() => {
    if (!analysisResult) return [];
    return analysisResult.by_type.slice(0, 15).map((item) => ({
      name: `.${item.extension}`,
      files: item.file_count,
      lines: item.total_lines,
      fill: getExtColor(item.extension),
    }));
  }, [analysisResult]);

  if (isAnalyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="w-12 h-12 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <p className="text-[var(--text-secondary)] font-medium">正在分析代码...</p>
        <p className="text-sm text-[var(--text-faint)] mt-1">这可能需要一些时间</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-4">
          <span className="text-2xl">⚠️</span>
        </div>
        <p className="text-red-600 dark:text-red-300 font-medium">{error}</p>
      </div>
    );
  }

  if (!analysisResult) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--bg-muted)] flex items-center justify-center mb-4">
          <FileCode size={28} className="text-[var(--text-faint)]" />
        </div>
        <p className="text-[var(--text-secondary)] font-medium">请先选择一个项目</p>
        <p className="text-sm text-[var(--text-faint)] mt-1">
          在"项目选择"页面选择文件夹后即可查看分析结果
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-1">代码分析</h2>
        <p className="text-[var(--text-muted)] text-sm">
          项目: <span className="font-medium text-[var(--text-secondary)]">{analysisResult.project_name}</span>
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          icon={FileCode}
          label="文件总数"
          value={analysisResult.total_files.toLocaleString()}
          iconColor="text-indigo-500 dark:text-indigo-400"
          bgColor="bg-indigo-50 dark:bg-indigo-500/10"
        />
        <SummaryCard
          icon={Layers}
          label="代码行数"
          value={formatLines(analysisResult.total_lines)}
          iconColor="text-emerald-500 dark:text-emerald-400"
          bgColor="bg-emerald-50 dark:bg-emerald-500/10"
        />
        <SummaryCard
          icon={HardDrive}
          label="总大小"
          value={formatBytes(analysisResult.total_bytes)}
          iconColor="text-amber-500 dark:text-amber-400"
          bgColor="bg-amber-50 dark:bg-amber-500/10"
        />
        <SummaryCard
          icon={TrendingUp}
          label="文件类型"
          value={analysisResult.by_type.length.toString()}
          iconColor="text-rose-500 dark:text-rose-400"
          bgColor="bg-rose-50 dark:bg-rose-500/10"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-5">
        {/* Pie Chart */}
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            代码行数分布
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [
                  `${value.toLocaleString()} 行`,
                  "行数",
                ]}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-[var(--text-secondary)]">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart */}
        <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-4">
            各类型文件数量
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12 }}
                width={60}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === "files" ? "文件数" : "行数",
                ]}
              />
              <Bar
                dataKey="files"
                fill="#6366f1"
                radius={[0, 6, 6, 0]}
                name="files"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail Table */}
      <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] overflow-hidden">
        <div className="p-5 border-b border-[var(--border-subtle)]">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] flex items-center gap-2">
            <ArrowUpDown size={16} className="text-[var(--text-faint)]" />
            详细统计
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--bg-subtle)]">
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                  文件类型
                </th>
                <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                  文件数
                </th>
                <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                  代码行数
                </th>
                <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                  大小
                </th>
                <th className="text-right text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3">
                  占比
                </th>
                <th className="text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider px-5 py-3 w-48">
                  分布
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {analysisResult.by_type.map((item) => {
                const percent =
                  (item.total_lines / analysisResult.total_lines) * 100;
                return (
                  <tr
                    key={item.extension}
                    className="hover:bg-[var(--bg-subtle)] transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{
                            backgroundColor: getExtColor(item.extension),
                          }}
                        />
                        <span className="text-sm font-medium text-[var(--text-secondary)]">
                          .{item.extension}
                        </span>
                      </div>
                    </td>
                    <td className="text-right px-5 py-3.5 text-sm text-[var(--text-secondary)] tabular-nums">
                      {item.file_count.toLocaleString()}
                    </td>
                    <td className="text-right px-5 py-3.5 text-sm text-[var(--text-secondary)] tabular-nums">
                      {item.total_lines.toLocaleString()}
                    </td>
                    <td className="text-right px-5 py-3.5 text-sm text-[var(--text-muted)] tabular-nums">
                      {formatBytes(item.total_bytes)}
                    </td>
                    <td className="text-right px-5 py-3.5 text-sm text-[var(--text-muted)] tabular-nums">
                      {formatPercent(item.total_lines, analysisResult.total_lines)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="w-full bg-[var(--bg-muted)] rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(percent, 1)}%`,
                            backgroundColor: getExtColor(item.extension),
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  iconColor,
  bgColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  iconColor: string;
  bgColor: string;
}) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-xl border border-[var(--border-default)] p-5 hover:shadow-sm transition-shadow">
      <div className={`w-10 h-10 ${bgColor} rounded-xl flex items-center justify-center mb-3`}>
        <Icon size={20} className={iconColor} />
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
      <p className="text-sm text-[var(--text-muted)] mt-1">{label}</p>
    </div>
  );
}
