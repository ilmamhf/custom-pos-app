import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { TopProduct } from '@/api/types'
import { MoneyText } from '@/components/shared/MoneyText'

interface TopProductsTableProps {
  products: TopProduct[]
}

export const TopProductsTable: React.FC<TopProductsTableProps> = ({
  products,
}) => {
  if (!products || products.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Top Selling Products</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center text-slate-400 text-sm">
          No sales data recorded
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle>Top Products by Revenue</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-y border-slate-200 text-xs font-semibold text-slate-500 uppercase">
              <tr>
                <th className="py-2.5 px-4 w-12 text-center">#</th>
                <th className="py-2.5 px-4">Product Name</th>
                <th className="py-2.5 px-4 text-right">Units Sold</th>
                <th className="py-2.5 px-4 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((item, index) => (
                <tr key={item.productId || index} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4 text-center font-mono text-xs text-slate-400">
                    {index + 1}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-800">
                    {item.name}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-600">
                    {item.qtySold.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-right font-medium">
                    <MoneyText amount={item.revenue} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
