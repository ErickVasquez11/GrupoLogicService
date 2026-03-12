'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function RegistrarCarrera() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [unidades, setUnidades] = useState<any[]>([]);
  
  const [unidadFija, setUnidadFija] = useState(false);

  const [formData, setFormData] = useState({
    fecha: '',
    hora_salida: '',
    hora_llegada: '',
    cliente: '',
    servicio_a: '',
    inicio: '',
    destino: '',
    centro_costo: '',
    metodo_pago: '', 
    valor: '',
    proveedor_id: '',
    unidad_id: ''
  });

  useEffect(() => {
    const checkSessionAndFetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      setUserId(session.user.id);

      const { data: perfil } = await supabase
        .from('perfiles_usuario')
        .select('unidad_id')
        .eq('id', session.user.id)
        .single();

      if (perfil && perfil.unidad_id) {
        setUnidadFija(true);
        setFormData(prev => ({ ...prev, unidad_id: perfil.unidad_id }));
      }

      const { data: provs } = await supabase.from('proveedores').select('*');
      if (provs) setProveedores(provs);

      const { data: unids } = await supabase.from('unidades').select('*');
      if (unids) setUnidades(unids);
    };

    checkSessionAndFetchData();
  }, [router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setLoading(true);

    const datosAEnviar = {
      ...formData,
      usuario_id: userId,
      unidad_id: formData.unidad_id ? formData.unidad_id : null,
      hora_llegada: formData.hora_llegada ? formData.hora_llegada : null,
      centro_costo: formData.centro_costo ? formData.centro_costo : null,
    };

    const { error } = await supabase.from('carreras').insert([datosAEnviar]);

    if (error) {
      toast.error('Error al registrar: ' + error.message, {
        position: "top-right",
        autoClose: 5000,
      });
    } else {
      toast.success('Su servicio ha sido registrado exitosamente, gracias.', {
        position: "top-right",
        autoClose: 4000,
      });

      setFormData(prev => ({ 
        ...prev, 
        hora_salida: '', 
        hora_llegada: '', 
        cliente: '', 
        servicio_a: '', 
        inicio: '', 
        destino: '', 
        centro_costo: '', 
        metodo_pago: '', 
        valor: '',
        proveedor_id: '',
        unidad_id: unidadFija ? prev.unidad_id : ''
      }));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <ToastContainer />
      
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-black text-white p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Grupo LOGIC</h1>
            <p className="text-gray-300 text-sm mt-1">Registro Operativo de Carreras</p>
          </div>
          <button 
            onClick={() => { supabase.auth.signOut(); router.push('/'); }} 
            className="text-sm bg-gray-800 px-3 py-1.5 rounded hover:bg-gray-700 transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha <span className="text-red-500">*</span></label>
              <input type="date" name="fecha" required onChange={handleChange} value={formData.fecha} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" />
            </div>
            
            {/* CORRECCIÓN PARA IOS: px-2, bg-white, text-gray-900, min-h-[44px] */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">H. Salida <span className="text-red-500">*</span></label>
                <input type="time" name="hora_salida" required onChange={handleChange} value={formData.hora_salida} className="w-full px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">H. Llegada</label>
                <input type="time" name="hora_llegada" onChange={handleChange} value={formData.hora_llegada} className="w-full px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente <span className="text-red-500">*</span></label>
              <input type="text" name="cliente" required onChange={handleChange} value={formData.cliente} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" placeholder="Nombre de la empresa/cliente" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Servicio A: <span className="text-red-500">*</span></label>
              <input type="text" name="servicio_a" required onChange={handleChange} value={formData.servicio_a} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" placeholder="Pasajero o carga" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Inicio <span className="text-red-500">*</span></label>
              <input type="text" name="inicio" required onChange={handleChange} value={formData.inicio} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destino <span className="text-red-500">*</span></label>
              <input type="text" name="destino" required onChange={handleChange} value={formData.destino} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Costo</label>
              <input type="text" name="centro_costo" onChange={handleChange} value={formData.centro_costo} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" placeholder="Opcional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Método de Pago <span className="text-red-500">*</span></label>
                <select name="metodo_pago" required onChange={handleChange} value={formData.metodo_pago} className="w-full px-2 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]">
                  <option value="" disabled>Seleccione...</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Credito">Crédito</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor ($) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" name="valor" required onChange={handleChange} value={formData.valor} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" placeholder="0.00" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor <span className="text-red-500">*</span></label>
              <select name="proveedor_id" required onChange={handleChange} value={formData.proveedor_id} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]">
                <option value="" disabled>Seleccione un proveedor...</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre_proveedor}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unidad (Número de Equipo)</label>
              <select 
                name="unidad_id" 
                onChange={handleChange} 
                value={formData.unidad_id} 
                disabled={unidadFija}
                className={`w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none min-h-[44px] ${unidadFija ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-900'}`}
              >
                <option value="">Opcional...</option>
                {unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.numero_equipo}</option>
                ))}
              </select>
            </div>

          </div>

          <div className="pt-6 border-t border-gray-100">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-black text-white font-medium py-3 rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 min-h-[48px]"
            >
              {loading ? 'Guardando registro...' : 'Registrar Carrera'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}