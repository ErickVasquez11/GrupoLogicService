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

  // --- NUEVOS ESTADOS EXCLUSIVOS PARA EL ADMINISTRADOR ---
  const [rolUsuario, setRolUsuario] = useState<string | null>(null);
  const [carrerasAdmin, setCarrerasAdmin] = useState<any[]>([]);
  const [carreraEditando, setCarreraEditando] = useState<any>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

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

  // Función exclusiva para que el admin cargue los viajes recientes
  const fetchCarrerasAdmin = async () => {
    const { data } = await supabase
      .from('carreras')
      .select(`
        *,
        perfiles_usuario(nombre_completo),
        proveedores(nombre_proveedor),
        unidades(numero_equipo)
      `)
      .order('fecha', { ascending: false })
      .order('hora_salida', { ascending: false })
      .limit(100); // Mostramos los últimos 100 para no saturar la pantalla
    
    if (data) setCarrerasAdmin(data);
  };

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
        .select('unidad_id, rol') // Verificamos el rol aquí
        .eq('id', session.user.id)
        .single();

      if (perfil) {
        setRolUsuario(perfil.rol); // Guardamos el rol en secreto
        
        if (perfil.unidad_id) {
          setUnidadFija(true);
          setFormData(prev => ({ ...prev, unidad_id: perfil.unidad_id }));
        }

        // Si la base de datos confirma que es admin, revelamos la tabla de edición
        if (perfil.rol === 'admin') {
          fetchCarrerasAdmin();
        }
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
      toast.error('Error al registrar: ' + error.message, { position: "top-right", autoClose: 5000 });
    } else {
      toast.success('Su servicio ha sido registrado exitosamente, gracias.', { position: "top-right", autoClose: 4000 });

      setFormData(prev => ({ 
        ...prev, hora_salida: '', hora_llegada: '', cliente: '', servicio_a: '', 
        inicio: '', destino: '', centro_costo: '', metodo_pago: '', valor: '',
        proveedor_id: '', unidad_id: unidadFija ? prev.unidad_id : ''
      }));

      // Si el admin registró la carrera, actualizamos su tabla de abajo inmediatamente
      if (rolUsuario === 'admin') fetchCarrerasAdmin();
    }
    setLoading(false);
  };

  // --- LÓGICA DE EDICIÓN EXCLUSIVA PARA ADMIN ---
  const guardarEdicion = async () => {
    setGuardandoEdicion(true);
    const { error } = await supabase
      .from('carreras')
      .update({
        cliente: carreraEditando.cliente,
        servicio_a: carreraEditando.servicio_a,
        inicio: carreraEditando.inicio,
        destino: carreraEditando.destino,
        valor: carreraEditando.valor,
        metodo_pago: carreraEditando.metodo_pago,
        exento_comision: carreraEditando.exento_comision
      })
      .eq('id', carreraEditando.id);

    if (error) {
      toast.error('Error al actualizar: ' + error.message);
    } else {
      toast.success('Viaje actualizado correctamente.');
      setCarreraEditando(null);
      fetchCarrerasAdmin();
    }
    setGuardandoEdicion(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 relative">
      <ToastContainer />

      {/* --- VENTANA EMERGENTE DE EDICIÓN (SOLO SE ABRE PARA ADMINS) --- */}
      {carreraEditando && rolUsuario === 'admin' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">Editar Viaje</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valor ($)</label>
                <input type="number" step="0.01" value={carreraEditando.valor} onChange={e => setCarreraEditando({...carreraEditando, valor: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Método de Pago</label>
                <select value={carreraEditando.metodo_pago} onChange={e => setCarreraEditando({...carreraEditando, metodo_pago: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black text-gray-900">
                  <option value="Efectivo">Efectivo</option>
                  <option value="Credito">Crédito</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
              <input type="text" value={carreraEditando.cliente} onChange={e => setCarreraEditando({...carreraEditando, cliente: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black text-gray-900" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Punto de Inicio</label>
                <input type="text" value={carreraEditando.inicio} onChange={e => setCarreraEditando({...carreraEditando, inicio: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destino</label>
                <input type="text" value={carreraEditando.destino} onChange={e => setCarreraEditando({...carreraEditando, destino: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black text-gray-900" />
              </div>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" checked={carreraEditando.exento_comision || false} onChange={e => setCarreraEditando({...carreraEditando, exento_comision: e.target.checked})} className="w-5 h-5 text-black border-gray-300 rounded focus:ring-black accent-black" />
                <span className="ml-3 font-medium text-gray-800">No cobrar 10% de comisión (Exento)</span>
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
              <button onClick={() => setCarreraEditando(null)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
              <button onClick={guardarEdicion} disabled={guardandoEdicion} className="px-5 py-2 bg-black text-white rounded-lg hover:bg-gray-800 font-medium transition-colors disabled:bg-gray-400">
                {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* --- FORMULARIO ORIGINAL DE REGISTRO --- */}
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
        <div className="bg-black text-white p-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-wide">Grupo LOGIC</h1>
            <p className="text-gray-300 text-sm mt-1">Registro Operativo de Carreras</p>
          </div>
          <div className="flex gap-3">
            {/* Si es Admin, le mostramos un botón para ir a su Panel de Liquidación */}
            {rolUsuario === 'admin' && (
              <button onClick={() => router.push('/admin')} className="text-sm bg-gray-100 text-black px-3 py-1.5 rounded hover:bg-white transition-colors font-medium">Panel de Control</button>
            )}
            <button onClick={() => { supabase.auth.signOut(); router.push('/'); }} className="text-sm bg-gray-800 px-3 py-1.5 rounded hover:bg-gray-700 transition-colors">Cerrar Sesión</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha <span className="text-red-500">*</span></label>
              <input type="date" name="fecha" required onChange={handleChange} value={formData.fecha} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-gray-900 min-h-[44px]" />
            </div>
            
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

      {/* --- TABLA DE EDICIÓN (TOTALMENTE INVISIBLE PARA OPERADORES, SOLO PARA ADMIN) --- */}
      {rolUsuario === 'admin' && carrerasAdmin.length > 0 && (
        <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-blue-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-blue-900">Modificar Viajes (Vista Exclusiva Administrador)</h3>
            <span className="text-xs font-medium bg-blue-200 text-blue-800 px-2 py-1 rounded">Haz clic en un viaje para editar</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4">Fecha/Hora</th>
                  <th className="px-6 py-4">Cliente/Ruta</th>
                  <th className="px-6 py-4">Operador</th>
                  <th className="px-6 py-4">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {carrerasAdmin.map((carrera) => {
                  const valorNum = parseFloat(carrera.valor || 0);
                  const comisionNum = (valorNum > 5 && !carrera.exento_comision) ? valorNum * 0.10 : 0;

                  return (
                    <tr 
                      key={carrera.id} 
                      onClick={() => setCarreraEditando(carrera)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors group"
                      title="Clic para editar"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 group-hover:text-blue-700">{carrera.fecha}</div>
                        <div className="text-gray-500 text-xs">{carrera.hora_salida}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{carrera.cliente}</div>
                        <div className="text-gray-500 text-xs">{carrera.inicio} ➔ {carrera.destino}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{carrera.perfiles_usuario?.nombre_completo}</div>
                        <div className="text-gray-500 text-xs">{carrera.proveedores?.nombre_proveedor}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">${valorNum.toFixed(2)} ({carrera.metodo_pago})</div>
                        {comisionNum > 0 ? (
                          <div className="text-xs font-medium text-red-500 mt-1">- ${comisionNum.toFixed(2)} Com.</div>
                        ) : carrera.exento_comision ? (
                          <div className="text-xs font-medium text-green-600 mt-1">✓ Exento</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}