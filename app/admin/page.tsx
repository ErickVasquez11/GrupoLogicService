'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function AdminDashboard() {
  const router = useRouter();
  const [carreras, setCarreras] = useState<any[]>([]);
  const [proveedoresTotales, setProveedoresTotales] = useState<any[]>([]); 
  const [operadoresTotales, setOperadoresTotales] = useState<any[]>([]); 
  
  const [loading, setLoading] = useState(true);
  const [verificandoSeguridad, setVerificandoSeguridad] = useState(true);

  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [carreraEditando, setCarreraEditando] = useState<any>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // --- ESTADOS PARA EL GESTOR DE DIRECTORIO ---
  const [directorioAbierto, setDirectorioAbierto] = useState(false);
  const [dirTab, setDirTab] = useState('usuarios'); 
  const [creandoDato, setCreandoDato] = useState(false);

  const [formUsuario, setFormUsuario] = useState({ 
    email: '', password: '', nombre_completo: '', rol: 'user', proveedor_id: '', 
    numero_equipo: '', tipo_cuota: 'Frecuencia', valor_cuota: '' 
  });
  const [formProveedor, setFormProveedor] = useState({ nombre_proveedor: '', cuota_frecuencia: '' });

  // Función principal que carga Viajes, Proveedores y Unidades
  const fetchDatos = async () => {
    setLoading(true);
    
    const { data: carrerasData, error: carrerasError } = await supabase
      .from('carreras')
      .select(`*, perfiles_usuario(nombre_completo), proveedores(nombre_proveedor, cuota_frecuencia), unidades(numero_equipo, tipo_cuota, valor_cuota)`)
      .order('fecha', { ascending: false }).order('hora_salida', { ascending: false });

    if (carrerasError) toast.error('Error cargando viajes.');
    else setCarreras(carrerasData || []);

    const { data: provsData } = await supabase.from('proveedores').select('*').order('nombre_proveedor');
    if (provsData) setProveedoresTotales(provsData);

    const { data: opsData } = await supabase.from('perfiles_usuario').select('nombre_completo, unidades(id, numero_equipo, tipo_cuota, valor_cuota)').eq('rol', 'user');
    if (opsData) setOperadoresTotales(opsData);

    setLoading(false);
  };

  useEffect(() => {
    const checkSessionAndRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace('/');

      const { data: perfil } = await supabase.from('perfiles_usuario').select('rol').eq('id', session.user.id).single();
      if (!perfil || perfil.rol !== 'admin') return router.replace('/registrar'); 

      setVerificandoSeguridad(false);
      fetchDatos();
    };
    checkSessionAndRole();
  }, [router]);

  const limpiarFiltros = () => { setFiltroUsuario(''); setFiltroProveedor(''); setFechaInicio(''); setFechaFin(''); };

  // --- CREAR USUARIO Y UNIDAD (CÓDIGO REPARADO Y ORDENADO) ---
  const handleCrearUsuario = async (e: any) => {
    e.preventDefault();
    setCreandoDato(true);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      const supabaseSecundario = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

      // 1. Crear usuario de Auth (Con el .trim() para evitar errores de espacios)
      const { data: authData, error: authError } = await supabaseSecundario.auth.signUp({
        email: formUsuario.email.trim(), 
        password: formUsuario.password
      });

      if (authError) throw authError;

      if (authData.user) {
        let unidadId = null;

        // 2. Si el rol es operador ('user' o 'Operador (Conductor)'), creamos la unidad
        if (formUsuario.rol === 'user' || formUsuario.rol === 'Operador (Conductor)') {
          const { data: nuevaUnidad, error: unitError } = await supabase.from('unidades').insert([{
            numero_equipo: formUsuario.numero_equipo, 
            tipo_cuota: formUsuario.tipo_cuota, 
            valor_cuota: parseFloat(formUsuario.valor_cuota || '0')
          }]).select().single();

          if (unitError) throw unitError;
          unidadId = nuevaUnidad.id; 
        }

        // 3. Vinculamos todo en la tabla de perfiles
        const { error: profileError } = await supabase.from('perfiles_usuario').upsert([{
          id: authData.user.id, 
          nombre_completo: formUsuario.nombre_completo, 
          rol: formUsuario.rol,
          proveedor_id: formUsuario.rol === 'proveedor' ? formUsuario.proveedor_id : null,
          unidad_id: unidadId 
        }]);

        if (profileError) throw profileError;
        
        toast.success(formUsuario.rol === 'user' ? 'Operador y Unidad registrados con éxito.' : 'Acceso registrado exitosamente.');
        setFormUsuario({ email: '', password: '', nombre_completo: '', rol: 'user', proveedor_id: '', numero_equipo: '', tipo_cuota: 'Frecuencia', valor_cuota: '' });
        await fetchDatos();
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
    setCreandoDato(false);
  };

  // --- CREAR PROVEEDOR ---
  const handleCrearProveedor = async (e: any) => {
    e.preventDefault();
    setCreandoDato(true);
    const { error } = await supabase.from('proveedores').insert([{ nombre_proveedor: formProveedor.nombre_proveedor, cuota_frecuencia: parseFloat(formProveedor.cuota_frecuencia || '0') }]);
    if (error) toast.error('Error: ' + error.message);
    else { toast.success('Proveedor creado exitosamente.'); setFormProveedor({ nombre_proveedor: '', cuota_frecuencia: '' }); await fetchDatos(); }
    setCreandoDato(false);
  };

  // --- NUEVAS FUNCIONES DE ELIMINACIÓN ---
  const eliminarProveedor = async (id: string, nombre: string) => {
    const confirmacion = window.confirm(`¿Seguro que deseas eliminar al proveedor "${nombre}"?\n\nIMPORTANTE: Si este proveedor ya tiene viajes registrados, el sistema cancelará la acción para proteger tu contabilidad.`);
    if (!confirmacion) return;
    toast.info('Eliminando proveedor...');
    const { error } = await supabase.from('proveedores').delete().eq('id', id);
    if (error) toast.error('No se puede eliminar: El proveedor ya tiene viajes o usuarios vinculados.');
    else { toast.success('Proveedor eliminado exitosamente.'); fetchDatos(); }
  };

  const eliminarUnidad = async (id: string, equipo: string) => {
    const confirmacion = window.confirm(`¿Seguro que deseas eliminar la unidad "${equipo}"?\n\nIMPORTANTE: Si esta unidad ya tiene viajes registrados, el sistema cancelará la acción para proteger tu contabilidad.`);
    if (!confirmacion) return;
    toast.info('Eliminando unidad...');
    const { error } = await supabase.from('unidades').delete().eq('id', id);
    if (error) toast.error('No se puede eliminar: La unidad ya tiene viajes vinculados.');
    else { toast.success('Unidad eliminada exitosamente.'); fetchDatos(); }
  };

  const guardarEdicion = async () => {
    setGuardandoEdicion(true);
    const { error } = await supabase.from('carreras').update({
        cliente: carreraEditando.cliente, servicio_a: carreraEditando.servicio_a, inicio: carreraEditando.inicio,
        destino: carreraEditando.destino, valor: carreraEditando.valor, metodo_pago: carreraEditando.metodo_pago,
        exento_comision: carreraEditando.exento_comision
      }).eq('id', carreraEditando.id);
    if (error) toast.error('Error al guardar: ' + error.message);
    else { toast.success('Viaje actualizado. Recalculando...'); setCarreraEditando(null); fetchDatos(); }
    setGuardandoEdicion(false);
  };

  const eliminarCarrera = async (id: string) => {
    const confirmacion = window.confirm("¿Estás seguro de que deseas eliminar este viaje por completo? Esta acción no se puede deshacer.");
    if (!confirmacion) return;
    setGuardandoEdicion(true); 
    const { error } = await supabase.from('carreras').delete().eq('id', id);
    if (error) toast.error('Error al eliminar: ' + error.message);
    else { toast.success('Viaje eliminado permanentemente.'); setCarreraEditando(null); fetchDatos(); }
    setGuardandoEdicion(false);
  };

  const actualizarCuotaProveedor = async (id: string, nombre: string, valorActual: number) => {
    if (!id) return;
    const nuevoValor = prompt(`Ingrese la nueva Cuota de Frecuencia ($) para ${nombre}:`, valorActual.toString());
    if (nuevoValor === null) return;
    const num = parseFloat(nuevoValor);
    if (isNaN(num) || num < 0) return toast.warning('Por favor, ingrese un número válido.');
    toast.info('Actualizando...');
    const { error } = await supabase.from('proveedores').update({ cuota_frecuencia: num }).eq('id', id);
    if (error) toast.error('Error al actualizar: ' + error.message);
    else { toast.success('Frecuencia del proveedor actualizada.'); fetchDatos(); }
  };

  const actualizarCuotaUnidad = async (id: string, equipo: string, tipo: string, valorActual: number) => {
    if (!id) return toast.error('Este operador no tiene una unidad asignada para cobrarle cuota.');
    const nuevoValor = prompt(`Ingrese el nuevo valor de la cuota (${tipo}) para la Unidad ${equipo}:`, valorActual.toString());
    if (nuevoValor === null) return;
    const num = parseFloat(nuevoValor);
    if (isNaN(num) || num < 0) return toast.warning('Por favor, ingrese un número válido.');
    toast.info('Actualizando...');
    const { error } = await supabase.from('unidades').update({ valor_cuota: num }).eq('id', id);
    if (error) toast.error('Error al actualizar: ' + error.message);
    else { toast.success('Cuota de la unidad actualizada.'); fetchDatos(); }
  };

  if (verificandoSeguridad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 font-medium animate-pulse flex flex-col items-center">
          <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-4"></div>
          Verificando acceso seguro...
        </div>
      </div>
    );
  }

  const usuariosUnicos = Array.from(new Set(carreras.map(c => c.perfiles_usuario?.nombre_completo))).filter(Boolean);
  
  const carrerasFiltradas = carreras.filter(carrera => {
    const coincideUsuario = filtroUsuario ? carrera.perfiles_usuario?.nombre_completo === filtroUsuario : true;
    const coincideProveedor = filtroProveedor ? carrera.proveedores?.nombre_proveedor === filtroProveedor : true;
    let coincideFecha = true;
    if (fechaInicio && fechaFin) coincideFecha = carrera.fecha >= fechaInicio && carrera.fecha <= fechaFin;
    else if (fechaInicio) coincideFecha = carrera.fecha >= fechaInicio;
    else if (fechaFin) coincideFecha = carrera.fecha <= fechaFin;
    return coincideUsuario && coincideProveedor && coincideFecha;
  });

  const resumenUsuarios: Record<string, any> = {};
  const resumenProveedores: Record<string, any> = {};

  proveedoresTotales.forEach(p => {
    if (filtroProveedor && filtroProveedor !== p.nombre_proveedor) return; 
    resumenProveedores[p.nombre_proveedor] = {
      proveedor: p.nombre_proveedor, proveedor_id: p.id, viajes: 0, bruto: 0, total_creditos: 0,
      comision_a_descontar: 0, cuota_frecuencia: parseFloat(p.cuota_frecuencia || 0)
    };
  });

  operadoresTotales.forEach(op => {
    if (filtroUsuario && filtroUsuario !== op.nombre_completo) return;
    resumenUsuarios[op.nombre_completo] = { 
      usuario: op.nombre_completo, unidad: op.unidades?.numero_equipo || 'S/N', unidad_id: op.unidades?.id || null, 
      viajes: 0, bruto: 0, creditos_a_favor: 0, comision_descontar: 0, 
      tipo_cuota: op.unidades?.tipo_cuota || 'Frecuencia', valor_cuota: parseFloat(op.unidades?.valor_cuota || 0) 
    };
  });

  carrerasFiltradas.forEach(c => {
    const valor = parseFloat(c.valor || 0);
    const comision = (valor > 5 && !c.exento_comision) ? valor * 0.10 : 0;
    
    const userKey = c.perfiles_usuario?.nombre_completo || 'Usuario Desconocido';
    const provKey = c.proveedores?.nombre_proveedor;
    const esCredito = c.metodo_pago === 'Credito';

    if (resumenUsuarios[userKey]) {
      resumenUsuarios[userKey].viajes += 1; resumenUsuarios[userKey].bruto += valor; resumenUsuarios[userKey].comision_descontar += comision;
      if (esCredito) resumenUsuarios[userKey].creditos_a_favor += valor;
    }

    if (provKey && resumenProveedores[provKey]) {
      resumenProveedores[provKey].viajes += 1; resumenProveedores[provKey].bruto += valor; resumenProveedores[provKey].comision_a_descontar += comision;
      if (esCredito) resumenProveedores[provKey].total_creditos += valor;
    }
  });

  const datosLiquidacionUsuarios = Object.values(resumenUsuarios).map(u => ({ ...u, neto: u.creditos_a_favor - u.comision_descontar - u.valor_cuota }));
  const datosLiquidacionProveedores = Object.values(resumenProveedores).map(p => {
    const total_calculado = p.total_creditos - p.comision_a_descontar + p.cuota_frecuencia;
    return { ...p, total_a_cancelar: total_calculado };
  });

  const generarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18); doc.text('Reporte de Carreras - Grupo LOGIC', 14, 22);
    doc.setFontSize(11);
    
    let textoFiltro = `Generado el: ${new Date().toLocaleDateString()}`;
    if (fechaInicio && fechaFin) textoFiltro += ` | Período: ${fechaInicio} al ${fechaFin}`;
    if (filtroUsuario) textoFiltro += ` | Op: ${filtroUsuario}`;
    if (filtroProveedor) textoFiltro += ` | Prov: ${filtroProveedor}`;
    doc.text(textoFiltro, 14, 30);

    let startY = 38;

    if (filtroUsuario && datosLiquidacionUsuarios.length > 0) {
      const u = datosLiquidacionUsuarios[0]; 
      doc.setFont('', 'bold'); doc.text(`Liquidación de Unidad: ${u.usuario}`, 14, 40);
      doc.setFont('', 'normal'); doc.text(`Total Bruto: $${u.bruto.toFixed(2)}`, 14, 47); doc.text(`Credito a favor: $${u.creditos_a_favor.toFixed(2)}`, 14, 53);
      doc.text(`Comision en contra: -$${u.comision_descontar.toFixed(2)}`, 14, 59); doc.text(`Frecuencia: -$${u.valor_cuota.toFixed(2)}`, 14, 65);
      doc.setFont('', 'bold'); doc.text(`Total: $${u.neto.toFixed(2)}`, 14, 73);
      startY = 82; 
    } else if (filtroProveedor && datosLiquidacionProveedores.length > 0) {
      const p = datosLiquidacionProveedores[0]; 
      doc.setFont('', 'bold'); doc.text(`Liquidación de Proveedor: ${p.proveedor}`, 14, 40);
      doc.setFont('', 'normal'); doc.text(`Total Bruto: $${p.bruto.toFixed(2)}`, 14, 47); doc.text(`Credito a pagar: $${p.total_creditos.toFixed(2)}`, 14, 53);
      doc.text(`Comision en favor: -$${p.comision_a_descontar.toFixed(2)}`, 14, 59); doc.text(`Frecuencia: +$${p.cuota_frecuencia.toFixed(2)}`, 14, 65); 
      doc.setFont('', 'bold'); doc.text(`Total: $${p.total_a_cancelar.toFixed(2)}`, 14, 73);
      startY = 82; 
    }

    const tableData = carrerasFiltradas.map(c => {
      const valorNum = parseFloat(c.valor || 0); const comisionNum = (valorNum > 5 && !c.exento_comision) ? valorNum * 0.10 : 0;
      const detalleFinanzas = `$${valorNum.toFixed(2)} (${c.metodo_pago})\n${comisionNum > 0 ? `- $${comisionNum.toFixed(2)} Com.` : c.exento_comision ? 'Sin Com. (Exento)' : 'Sin Com.'}`;
      return [ `${c.fecha}\n${c.hora_salida}`, `${c.cliente}\n(${c.servicio_a})${c.centro_costo ? `\nCC: ${c.centro_costo}` : ''}`, `${c.inicio} ->\n${c.destino}`, c.perfiles_usuario?.nombre_completo || 'N/A', `${c.proveedores?.nombre_proveedor || 'N/A'} - U:${c.unidades?.numero_equipo || ''}`, detalleFinanzas ];
    });

    autoTable(doc, { startY: startY, head: [['Fecha/Hora', 'Cliente/Serv.', 'Ruta', 'Operador', 'Logística', 'Finanzas']], body: tableData, theme: 'grid', styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [0, 0, 0] } });
    doc.save('Reporte_LOGIC.pdf');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 relative">
      <ToastContainer />

      {/* --- VENTANA EMERGENTE GESTOR DE DIRECTORIO --- */}
      {directorioAbierto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-indigo-950 p-5 flex justify-between items-center text-white">
              <h2 className="font-bold text-lg flex items-center gap-2"><span>👥</span> Gestor de Directorio</h2>
              <button onClick={() => setDirectorioAbierto(false)} className="text-indigo-200 hover:text-white transition-colors">✕ Cerrar</button>
            </div>
            
            <div className="flex border-b bg-gray-50 text-sm">
              <button onClick={() => setDirTab('usuarios')} className={`flex-1 p-4 font-medium transition-colors ${dirTab === 'usuarios' ? 'bg-white border-b-2 border-indigo-900 text-indigo-950' : 'text-gray-500 hover:text-gray-900'}`}>Operadores (Usuarios)</button>
              <button onClick={() => setDirTab('proveedores')} className={`flex-1 p-4 font-medium transition-colors ${dirTab === 'proveedores' ? 'bg-white border-b-2 border-indigo-900 text-indigo-950' : 'text-gray-500 hover:text-gray-900'}`}>Proveedores</button>
            </div>

            <div className="p-6 overflow-y-auto bg-white">
              
              {dirTab === 'usuarios' && (
                <form onSubmit={handleCrearUsuario} className="space-y-4">
                  <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Registrar Nuevo Acceso</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-medium text-gray-500 mb-1">Correo Electrónico</label>
                    <input type="email" required value={formUsuario.email} onChange={e=>setFormUsuario({...formUsuario, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900" placeholder="ejemplo@logic.com"/></div>
                    <div><label className="block text-xs font-medium text-gray-500 mb-1">Contraseña Temporal</label>
                    <input type="text" required value={formUsuario.password} onChange={e=>setFormUsuario({...formUsuario, password: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900" placeholder="Mínimo 6 caracteres"/></div>
                  </div>
                  
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Nombre Completo (Real)</label>
                  <input type="text" required value={formUsuario.nombre_completo} onChange={e=>setFormUsuario({...formUsuario, nombre_completo: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900" placeholder="Juan Perez"/></div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-medium text-gray-500 mb-1">Rol en Sistema</label>
                    <select value={formUsuario.rol} onChange={e=>setFormUsuario({...formUsuario, rol: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900 bg-white">
                      <option value="user">Operador (Conductor)</option>
                      <option value="proveedor">Proveedor Logístico</option>
                      <option value="admin">Administrador</option>
                    </select></div>

                    {formUsuario.rol === 'proveedor' && (
                      <div><label className="block text-xs font-medium text-gray-500 mb-1">Vincular con Empresa</label>
                      <select required value={formUsuario.proveedor_id} onChange={e=>setFormUsuario({...formUsuario, proveedor_id: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900 bg-white">
                        <option value="">Seleccione proveedor...</option>
                        {proveedoresTotales.map(p => <option key={p.id} value={p.id}>{p.nombre_proveedor}</option>)}
                      </select></div>
                    )}
                  </div>

                  {formUsuario.rol === 'user' && (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2">
                      <h4 className="font-bold text-gray-700 mb-3 border-b pb-1 text-sm">Crear y Asignar Unidad Física</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">N° de Equipo</label>
                          <input type="text" required value={formUsuario.numero_equipo} onChange={e=>setFormUsuario({...formUsuario, numero_equipo: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900" placeholder="Ej. U-01"/>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de Cuota</label>
                          <select value={formUsuario.tipo_cuota} onChange={e=>setFormUsuario({...formUsuario, tipo_cuota: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900 bg-white">
                            <option value="Frecuencia">Frecuencia</option>
                            <option value="Cuadre">Cuadre</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Valor Cuota ($)</label>
                          <input type="number" step="0.01" required value={formUsuario.valor_cuota} onChange={e=>setFormUsuario({...formUsuario, valor_cuota: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900" placeholder="0.00"/>
                        </div>
                      </div>
                    </div>
                  )}

                  <button type="submit" disabled={creandoDato} className="w-full mt-4 bg-indigo-950 text-white py-2.5 rounded-lg hover:bg-indigo-900 font-medium transition-colors disabled:bg-gray-400">
                    {creandoDato ? 'Guardando Datos...' : 'Crear Acceso en Sistema'}
                  </button>
                </form>
              )}

              {dirTab === 'proveedores' && (
                <form onSubmit={handleCrearProveedor} className="space-y-4">
                  <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">Registrar Nuevo Proveedor</h3>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Nombre del Proveedor</label>
                  <input type="text" required value={formProveedor.nombre_proveedor} onChange={e=>setFormProveedor({...formProveedor, nombre_proveedor: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900" /></div>
                  <div><label className="block text-xs font-medium text-gray-500 mb-1">Cuota de Frecuencia Inicial ($)</label>
                  <input type="number" step="0.01" required value={formProveedor.cuota_frecuencia} onChange={e=>setFormProveedor({...formProveedor, cuota_frecuencia: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-indigo-900" placeholder="0.00" /></div>
                  <button type="submit" disabled={creandoDato} className="w-full mt-4 bg-indigo-950 text-white py-2.5 rounded-lg hover:bg-indigo-900 font-medium transition-colors disabled:bg-gray-400">
                    {creandoDato ? 'Guardando...' : 'Crear Proveedor'}
                  </button>
                </form>
              )}

            </div>
          </div>
        </div>
      )}

      {/* --- VENTANA EMERGENTE DE EDICIÓN DE VIAJE --- */}
      {carreraEditando && !directorioAbierto && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">Editar Carrera</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valor ($)</label>
                <input type="number" step="0.01" value={carreraEditando.valor} onChange={e => setCarreraEditando({...carreraEditando, valor: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Método de Pago</label>
                <select value={carreraEditando.metodo_pago} onChange={e => setCarreraEditando({...carreraEditando, metodo_pago: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black">
                  <option value="Efectivo">Efectivo</option>
                  <option value="Credito">Crédito</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
              <input type="text" value={carreraEditando.cliente} onChange={e => setCarreraEditando({...carreraEditando, cliente: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Punto de Inicio</label>
                <input type="text" value={carreraEditando.inicio} onChange={e => setCarreraEditando({...carreraEditando, inicio: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destino</label>
                <input type="text" value={carreraEditando.destino} onChange={e => setCarreraEditando({...carreraEditando, destino: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-black" />
              </div>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" checked={carreraEditando.exento_comision || false} onChange={e => setCarreraEditando({...carreraEditando, exento_comision: e.target.checked})} className="w-5 h-5 text-black border-gray-300 rounded focus:ring-black accent-black" />
                <span className="ml-3 font-medium text-gray-800">No cobrar 10% de comisión (Exento)</span>
              </label>
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t items-center">
              <button onClick={() => eliminarCarrera(carreraEditando.id)} disabled={guardandoEdicion} className="mr-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors disabled:opacity-50">
                🗑️ Eliminar
              </button>
              <button onClick={() => setCarreraEditando(null)} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancelar</button>
              <button onClick={guardarEdicion} disabled={guardandoEdicion} className="px-5 py-2 bg-black text-white rounded-lg hover:bg-gray-800 font-medium transition-colors disabled:bg-gray-400">
                {guardandoEdicion ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
            <p className="text-gray-500 text-sm">Liquidaciones y Reporte General</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setDirectorioAbierto(true)} className="bg-indigo-50 border border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-2 font-medium">
              <span>👥</span> Directorio
            </button>
            <button onClick={fetchDatos} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
              <span>🔄</span> Actualizar
            </button>
            <button onClick={generarPDF} className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2">
              Exportar PDF
            </button>
            <button onClick={() => { supabase.auth.signOut(); router.push('/'); }} className="bg-white border border-red-300 text-red-600 px-4 py-2 rounded-lg hover:bg-red-50 transition-colors">
              Cerrar Sesión
            </button>
          </div>
        </div>

        <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-100 mb-6 space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Operador</label>
              <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white">
                <option value="">Todos los operadores</option>
                {usuariosUnicos.map((user: any, index) => <option key={index} value={user}>{user}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Proveedor</label>
              <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white font-medium text-blue-700">
                <option value="">Todos los proveedores</option>
                {proveedoresTotales.map((prov: any) => <option key={prov.id} value={prov.nombre_proveedor}>{prov.nombre_proveedor}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-gray-100 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde (Fecha Inicio)</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta (Fecha Fin)</label>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none" />
            </div>
            <div className="w-full md:w-auto">
              <button onClick={limpiarFiltros} className="w-full px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors h-[42px]">Limpiar Filtros</button>
            </div>
          </div>
        </div>

        {!loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-blue-50 px-4 py-3 border-b border-gray-100"><h3 className="font-semibold text-blue-900">Liquidación por Operador (Usuario)</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-4 py-2">Operador / Unidad</th>
                      <th className="px-4 py-2 text-right">Bruto</th>
                      <th className="px-4 py-2 text-right text-blue-600">Crédito a favor</th>
                      <th className="px-4 py-2 text-right text-red-600">- Com.</th>
                      <th className="px-4 py-2 text-right text-red-600">- Cuota Fija</th>
                      <th className="px-4 py-2 text-right font-bold text-gray-900">Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {datosLiquidacionUsuarios.length > 0 ? datosLiquidacionUsuarios.map((u, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-amber-500">
                          <span className="font-medium text-black">{u.usuario}</span><br/>
                          <span className="text-xs text-gray-500">U: {u.unidad}</span>
                          {/* BOTÓN ELIMINAR UNIDAD */}
                          {u.unidad_id && (
                            <button onClick={() => eliminarUnidad(u.unidad_id, u.unidad)} className="ml-1 text-[10px] bg-red-100 hover:bg-red-200 text-red-600 px-1.5 py-0.5 rounded transition-colors" title="Eliminar unidad física">🗑️</button>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-green-600">${u.bruto.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-blue-600 font-medium">${u.creditos_a_favor.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-red-500">-${u.comision_descontar.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-red-500">
                          -${u.valor_cuota.toFixed(2)} 
                          <button onClick={() => actualizarCuotaUnidad(u.unidad_id, u.unidad, u.tipo_cuota, u.valor_cuota)} className="ml-2 inline-block text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded transition-colors" title="Editar cuota">✏️</button>
                          <br/><span className="text-[10px] text-gray-400">({u.tipo_cuota})</span>
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-gray-900">${u.neto.toFixed(2)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No hay operadores activos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-purple-50 px-4 py-3 border-b border-gray-100"><h3 className="font-semibold text-purple-900">Reporte de Liquidación del Proveedor</h3></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-4 py-2 ">Proveedor</th>
                      <th className="px-4 py-2 text-right text-gray-600">Bruto</th>
                      <th className="px-4 py-2 text-right text-blue-700">Créditos</th>
                      <th className="px-4 py-2 text-right text-red-600">- Comisiones</th>
                      <th className="px-4 py-2 text-right text-green-600">+ Frecuencia</th>
                      <th className="px-4 py-2 text-right font-bold text-gray-900">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {datosLiquidacionProveedores.length > 0 ? datosLiquidacionProveedores.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-green-700">
                          {p.proveedor}
                          {/* BOTÓN ELIMINAR PROVEEDOR */}
                          {p.proveedor_id && (
                            <button onClick={() => eliminarProveedor(p.proveedor_id, p.proveedor)} className="ml-2 text-[10px] bg-red-100 hover:bg-red-200 text-red-600 px-1.5 py-0.5 rounded transition-colors" title="Eliminar proveedor">🗑️</button>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">${p.bruto.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-blue-700">${p.total_creditos.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-red-500">-${p.comision_a_descontar.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-green-600 flex justify-end items-center">
                          +${p.cuota_frecuencia.toFixed(2)} 
                          <button onClick={() => actualizarCuotaProveedor(p.proveedor_id, p.proveedor, p.cuota_frecuencia)} className="ml-2 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded transition-colors" title="Editar frecuencia">✏️</button>
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-gray-900">${p.total_a_cancelar.toFixed(2)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No hay proveedores creados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <h3 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
          <span>Desglose Viaje por Viaje</span>
          <span className="text-sm font-normal text-gray-500">{carrerasFiltradas.length} carreras <span className="hidden md:inline">(Clic en el viaje para editar)</span></span>
        </h3>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          {loading ? (
            <div className="p-8 text-center text-gray-500">
              <div className="w-8 h-8 border-4 border-gray-300 border-t-black rounded-full animate-spin mx-auto mb-4"></div>
              Cargando reportes actualizados...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4">Fecha/Hora</th>
                    <th className="px-6 py-4">Servicio</th>
                    <th className="px-6 py-4">Ruta</th>
                    <th className="px-6 py-4">Operador / Logística</th>
                    <th className="px-6 py-4">Finanzas Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {carrerasFiltradas.map((carrera) => {
                    const valorNum = parseFloat(carrera.valor || 0);
                    const comisionNum = (valorNum > 5 && !carrera.exento_comision) ? valorNum * 0.10 : 0;

                    return (
                      <tr 
                        key={carrera.id} 
                        onClick={() => setCarreraEditando(carrera)}
                        className="hover:bg-blue-50 cursor-pointer transition-colors group"
                        title="Haz clic para editar este viaje"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 group-hover:text-blue-700">{carrera.fecha}</div>
                          <div className="text-gray-500">{carrera.hora_salida}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.cliente}</div>
                          <div className="text-gray-500">{carrera.servicio_a}</div>
                          {carrera.centro_costo && <div className="text-xs font-medium text-indigo-600 mt-1">CC: {carrera.centro_costo}</div>}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-gray-900"><span className="text-gray-500">De:</span> {carrera.inicio}</div>
                          <div className="text-gray-900"><span className="text-gray-500">A:</span> {carrera.destino}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.proveedores?.nombre_proveedor}</div>
                          <div className="text-gray-600 text-xs">Unidad: {carrera.unidades?.numero_equipo}</div>
                          <div className="text-gray-500 text-xs mt-1">Op: {carrera.perfiles_usuario?.nombre_completo}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">${valorNum.toFixed(2)}</div>
                          <div className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full inline-block mt-1">{carrera.metodo_pago}</div>
                          {comisionNum > 0 ? (
                            <div className="text-xs font-medium text-red-500 mt-1">- ${comisionNum.toFixed(2)} (Comisión)</div>
                          ) : carrera.exento_comision ? (
                            <div className="text-xs font-medium text-green-600 mt-1">✓ Exento (Sin Com.)</div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {carrerasFiltradas.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No se encontraron carreras.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}