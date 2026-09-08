'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="panel empty"><h1>暂时无法打开</h1><p>请稍后重试。未收到保存确认时，不要把它当作已经保存。</p><button onClick={reset}>重试</button></section>;}
