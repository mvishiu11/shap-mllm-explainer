import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface ModalityComparisonViewProps {
  textAttributions: number[];
  audioAttributions: number[];
}

export function ModalityComparisonView({
  textAttributions,
  audioAttributions,
}: ModalityComparisonViewProps) {
  // Calculate total attribution by modality
  const textTotal = textAttributions.reduce((a, b) => a + Math.abs(b), 0);
  const audioTotal = audioAttributions.reduce((a, b) => a + Math.abs(b), 0);
  const grandTotal = textTotal + audioTotal;

  const textPercentage = (textTotal / grandTotal) * 100;
  const audioPercentage = (audioTotal / grandTotal) * 100;

  // Pie chart data
  const pieData = [
    { name: "Text", value: textTotal, percentage: textPercentage },
    { name: "Audio", value: audioTotal, percentage: audioPercentage },
  ];

  const COLORS = {
    Text: "#3b82f6",
    Audio: "#8b5cf6",
  };

  // Statistical comparison
  const textStats = {
    mean: textAttributions.reduce((a, b) => a + b, 0) / textAttributions.length,
    max: Math.max(...textAttributions),
    min: Math.min(...textAttributions),
    std: Math.sqrt(
      textAttributions.reduce((sum, val) => {
        const mean = textAttributions.reduce((a, b) => a + b, 0) / textAttributions.length;
        return sum + Math.pow(val - mean, 2);
      }, 0) / textAttributions.length
    ),
  };

  const audioStats = {
    mean: audioAttributions.reduce((a, b) => a + b, 0) / audioAttributions.length,
    max: Math.max(...audioAttributions),
    min: Math.min(...audioAttributions),
    std: Math.sqrt(
      audioAttributions.reduce((sum, val) => {
        const mean = audioAttributions.reduce((a, b) => a + b, 0) / audioAttributions.length;
        return sum + Math.pow(val - mean, 2);
      }, 0) / audioAttributions.length
    ),
  };

  const comparisonData = [
    {
      metric: "Mean",
      Text: textStats.mean,
      Audio: audioStats.mean,
    },
    {
      metric: "Max",
      Text: textStats.max,
      Audio: audioStats.max,
    },
    {
      metric: "Std Dev",
      Text: textStats.std,
      Audio: audioStats.std,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Overall Contribution */}
      <Card>
        <CardHeader>
          <CardTitle>Modality Contribution Distribution</CardTitle>
          <CardDescription>
            Relative importance of each input modality to the model output
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            {/* Pie Chart */}
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={COLORS[entry.name as keyof typeof COLORS]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload[0]) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded shadow-lg">
                            <div className="text-sm">
                              <div className="text-slate-900 dark:text-slate-100 mb-1">
                                {data.name}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                Value: {data.value.toFixed(4)}
                              </div>
                              <div className="text-slate-600 dark:text-slate-400">
                                Share: {data.percentage.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Summary Cards */}
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-blue-900 dark:text-blue-100">Text Modality</span>
                  <Badge style={{ backgroundColor: COLORS.Text }}>
                    {textPercentage.toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-2xl text-blue-900 dark:text-blue-100">
                  {textTotal.toFixed(4)}
                </div>
                <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Total attribution value
                </div>
              </div>

              <div className="p-4 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-purple-900 dark:text-purple-100">Audio Modality</span>
                  <Badge style={{ backgroundColor: COLORS.Audio }}>
                    {audioPercentage.toFixed(1)}%
                  </Badge>
                </div>
                <div className="text-2xl text-purple-900 dark:text-purple-100">
                  {audioTotal.toFixed(4)}
                </div>
                <div className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                  Total attribution value
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistical Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Statistical Comparison</CardTitle>
          <CardDescription>
            Comparative statistics across modalities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" />
                <YAxis />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white dark:bg-slate-800 p-3 border border-slate-200 dark:border-slate-700 rounded shadow-lg">
                          <div className="text-sm">
                            <div className="text-slate-900 dark:text-slate-100 mb-2">
                              {payload[0].payload.metric}
                            </div>
                            {payload.map((entry, index) => (
                              <div
                                key={index}
                                className="text-slate-600 dark:text-slate-400"
                                style={{ color: entry.color }}
                              >
                                {entry.name}: {(entry.value as number).toFixed(4)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar dataKey="Text" fill={COLORS.Text} />
                <Bar dataKey="Audio" fill={COLORS.Audio} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Statistics Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left p-3 text-slate-600 dark:text-slate-400">Metric</th>
                  <th className="text-right p-3 text-slate-600 dark:text-slate-400">Text</th>
                  <th className="text-right p-3 text-slate-600 dark:text-slate-400">Audio</th>
                  <th className="text-right p-3 text-slate-600 dark:text-slate-400">Ratio</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100 dark:border-slate-900">
                  <td className="p-3 text-slate-900 dark:text-slate-100">Mean Attribution</td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {textStats.mean.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {audioStats.mean.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                    {(textStats.mean / audioStats.mean).toFixed(2)}x
                  </td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-900">
                  <td className="p-3 text-slate-900 dark:text-slate-100">Maximum Value</td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {textStats.max.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {audioStats.max.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                    {(textStats.max / audioStats.max).toFixed(2)}x
                  </td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-900">
                  <td className="p-3 text-slate-900 dark:text-slate-100">Minimum Value</td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {textStats.min.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {audioStats.min.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                    {(textStats.min / audioStats.min).toFixed(2)}x
                  </td>
                </tr>
                <tr className="border-b border-slate-100 dark:border-slate-900">
                  <td className="p-3 text-slate-900 dark:text-slate-100">Standard Deviation</td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {textStats.std.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {audioStats.std.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                    {(textStats.std / audioStats.std).toFixed(2)}x
                  </td>
                </tr>
                <tr>
                  <td className="p-3 text-slate-900 dark:text-slate-100">Total Attribution</td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {textTotal.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-900 dark:text-slate-100">
                    {audioTotal.toFixed(4)}
                  </td>
                  <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                    {(textTotal / audioTotal).toFixed(2)}x
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Interpretation */}
      <Card>
        <CardHeader>
          <CardTitle>Interpretation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
            <p>
              The <strong>{textPercentage > audioPercentage ? "text" : "audio"}</strong> modality 
              contributes more to the model's output, accounting for{" "}
              <strong>{Math.max(textPercentage, audioPercentage).toFixed(1)}%</strong> of the 
              total attribution.
            </p>
            <p>
              {textStats.std > audioStats.std ? (
                <>
                  Text attributions show higher variance (σ = {textStats.std.toFixed(4)}), 
                  suggesting more diverse token-level importance.
                </>
              ) : (
                <>
                  Audio attributions show higher variance (σ = {audioStats.std.toFixed(4)}), 
                  suggesting more diverse temporal importance.
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
