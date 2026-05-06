'use client';

import { useState, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL;
export default function Home() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
      } else {
        alert("Vänligen välj en PDF-fil.");
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("Vänligen välj en fil först!");

    setIsLoading(true);
    setStatus("Hämtar säker länk...");
    setResult('');
    const forcedFileType = 'application/pdf';

    try {
      const res = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, filetype: forcedFileType })
      });
      const { uploadPost } = await res.json();

      setStatus("Laddar upp dokument till AWS...");
      const formData = new FormData();

      Object.entries(uploadPost.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      formData.append('file', file);

      const uploadRes = await fetch(uploadPost.url, {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        setStatus("Ett fel uppstod vid S3-uppladdningen.");
        setIsLoading(false);
        return;
      }

      setStatus("Bearbetar texten med AI (vänligen vänta)...");
      const poll = setInterval(async () => {
        const r = await fetch(`${API_URL}/result?id=${file.name}`);
        const data = await r.json();

        if (data.Status === 'COMPLETED') {
          try {

            let cleanJson = data.ai_analysis;
            if (cleanJson.startsWith('```json')) {
              cleanJson = cleanJson.replace(/^```json\n?/, '').replace(/\n?```$/, '');
            } else if (cleanJson.startsWith('```')) {
              cleanJson = cleanJson.replace(/^```\n?/, '').replace(/\n?```$/, '');
            }
            const parsedAnalysis = JSON.parse(cleanJson);
            setResult(parsedAnalysis);
          } catch (e) {
            console.error("Kunde inte tolka JSON från Bedrock:", e);
            setResult({ raw: data.ai_analysis });
          }
          setStatus("");
          setIsLoading(false);
          clearInterval(poll);
        } else if (data.Status === 'FAILED_AI') {
          setStatus("Ett fel uppstod under AI-analysen.");
          setIsLoading(false);
          clearInterval(poll);
        }
      }, 3000);
    } catch (error) {
      console.error(error);
      setStatus("Ett fel uppstod: " + error.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans p-6 md:p-12 flex flex-col items-center justify-center">
      <main className="max-w-3xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-4">
            Ladda upp CV
          </h1>
          <p className="text-zinc-600 font-medium text-lg">
            Välj eller släpp din PDF-fil nedan för att extrahera texten.
          </p>
        </div>

        {/* Drag & Drop Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current.click()}
          className={`border-2 border-dashed rounded-[2rem] p-16 text-center cursor-pointer transition-all duration-200 mb-8 ${isDragging
            ? 'border-zinc-900 bg-zinc-50 scale-[1.02]'
            : 'border-zinc-300 bg-zinc-50/50 hover:bg-zinc-100 hover:border-zinc-400'
            }`}
        >
          <input
            type="file"
            accept="application/pdf"
            ref={fileInputRef}
            onChange={(e) => setFile(e.target.files[0])}
            className="hidden"
          />
          <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
            <svg className="w-12 h-12 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <div>
              <p className="text-zinc-900 font-bold text-xl mb-1">
                {file ? file.name : "Dra och släpp din PDF här"}
              </p>
              <p className="text-zinc-500 font-medium">
                {file ? "Klicka för att byta fil" : "eller klicka för att bläddra"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-center mb-16">
          <button
            onClick={handleUpload}
            disabled={isLoading || !file}
            className={`px-10 py-4 rounded-full text-base font-bold transition-all duration-200 ${isLoading || !file
              ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
              : 'bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer shadow-lg shadow-zinc-200 hover:shadow-xl hover:shadow-zinc-200 hover:-translate-y-0.5'
              }`}
          >
            {isLoading ? 'Bearbetar...' : 'Ladda upp & Läs'}
          </button>
        </div>

        {status && (
          <div className="text-center font-bold text-zinc-600 mb-8 animate-pulse">
            {status}
          </div>
        )}

        {result && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full text-left max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">AI-Analys av CV</h2>
            <div className="p-8 bg-zinc-50 rounded-[2rem] border border-zinc-100 shadow-sm space-y-6">
              {result.summary && (
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">Sammanfattning</h3>
                  <p className="text-zinc-700 leading-relaxed">{result.summary}</p>
                </div>
              )}
              {result.top_skills && result.top_skills.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">Toppfärdigheter</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.top_skills.map((skill, i) => (
                      <span key={i} className="px-3 py-1 bg-zinc-200 text-zinc-800 rounded-full text-sm font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.improvement_tip && (
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">Förbättringstips</h3>
                  <p className="text-zinc-700 leading-relaxed">{result.improvement_tip}</p>
                </div>
              )}
              {result.raw && (
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 mb-2">Rådata från AI</h3>
                  <p className="text-zinc-700 leading-relaxed whitespace-pre-wrap">{result.raw}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
