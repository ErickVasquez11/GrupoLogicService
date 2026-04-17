'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { supabase } from '../lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('Credenciales incorrectas. Verifica tu correo y contraseña.');
      setLoading(false);
      return;
    }

    if (authData.user) {
      const { data: perfil, error: perfilError } = await supabase
        .from('perfiles_usuario')
        .select('rol')
        .eq('id', authData.user.id)
        .single();

      if (perfilError) {
        router.push('/registrar');
      } else {
        if (perfil.rol === 'admin') {
          toast.success('Bienvenido al panel de control LOGIC', { autoClose: 1500 });
          setTimeout(() => router.push('/admin'), 1500);
        } else if (perfil.rol === 'proveedor') {
          toast.success('Ingresando al centro de Servicios', { autoClose: 1500 });
          setTimeout(() => router.push('/proveedor'), 1500);
        } else {
          toast.success('Ingresando al centro de registro de Servicios', { autoClose: 1500 });
          setTimeout(() => router.push('/registrar'), 1500);
        }
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <ToastContainer aria-label={undefined} />
      
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm p-8 border border-gray-100 overflow-hidden">
        <div className="text-center mb-8 flex flex-col items-center">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Bienvenido</h1>
          
          {/* 2. AQUÍ ESTÁ EL LOGO MEJORADO */}
          {/* src="/logo.png" busca automáticamente en la carpeta 'public' */}
          {/* He aplicado clases para forma circular, borde, sombra y centrado */}
          <div className="my-6 w-[130px] h-[130px] rounded-full overflow-hidden border-4 border-gray-100 shadow-lg flex items-center justify-center bg-white p-2">
            <Image 
              src="/logo.png" 
              alt="Logo Grupo LOGIC" 
              width={110}  // Ligeramente más pequeño para que respire dentro del círculo
              height={110}
              priority     // Carga esta imagen rápido
              className="object-contain rounded-full" // Asegura que la imagen se adapte al contenedor circular
            />
          </div>
          
          <p className="text-base text-gray-600 mt-2">Ingresa a tu cuenta para continuar</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black outline-none text-gray-900 transition-colors"
              placeholder="Usuario@logic.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-black outline-none text-gray-900 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white font-semibold py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 mt-4 text-base"
          >
            {loading ? 'Iniciando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}