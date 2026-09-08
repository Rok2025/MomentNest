import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'MomentNest · 又又的成长手账',description:'爸爸妈妈一起留下又又的精彩瞬间',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body><main className="container">{children}</main><footer>MomentNest · 把舍不得忘记的小事，慢慢留下来</footer></body></html>;}
