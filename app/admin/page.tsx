'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function AdminDashboard() {
  const router = useRouter();
  const [carreras, setCarreras] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [verificandoSeguridad, setVerificandoSeguridad] = useState(true);

  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const [carreraEditando, setCarreraEditando] = useState<any>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  const fetchCarreras = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('carreras')
      .select(`
        *,
        perfiles_usuario(nombre_completo),
        proveedores(nombre_proveedor, cuota_frecuencia),
        unidades(numero_equipo, tipo_cuota, valor_cuota)
      `)
      .order('fecha', { ascending: false })
      .order('hora_salida', { ascending: false });

    if (error) {
      console.error('Error cargando reportes:', error);
      toast.error('Error cargando datos de la base de datos.');
    } else {
      setCarreras(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    const checkSessionAndRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.replace('/');
        return;
      }

      const { data: perfil } = await supabase
        .from('perfiles_usuario')
        .select('rol')
        .eq('id', session.user.id)
        .single();

      if (!perfil || perfil.rol !== 'admin') {
        router.replace('/registrar'); 
        return;
      }

      setVerificandoSeguridad(false);
      fetchCarreras();
    };
    
    checkSessionAndRole();
  }, [router]);

  const limpiarFiltros = () => {
    setFiltroUsuario('');
    setFiltroProveedor('');
    setFechaInicio('');
    setFechaFin('');
  };

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
      toast.error('Error al guardar: ' + error.message);
    } else {
      toast.success('Viaje actualizado. Recalculando finanzas...');
      setCarreraEditando(null); 
      fetchCarreras(); 
    }
    setGuardandoEdicion(false);
  };

  // --- NUEVA FUNCIÓN PARA ELIMINAR EL VIAJE ---
  const eliminarCarrera = async (id: string) => {
    // Doble confirmación por seguridad
    const confirmacion = window.confirm("¿Estás seguro de que deseas eliminar este viaje por completo? Esta acción no se puede deshacer.");
    if (!confirmacion) return;

    setGuardandoEdicion(true); // Bloqueamos los botones mientras se borra
    
    const { error } = await supabase
      .from('carreras')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Error al eliminar: ' + error.message);
    } else {
      toast.success('Viaje eliminado permanentemente.');
      setCarreraEditando(null); // Cerramos la ventana
      fetchCarreras(); // Recargamos para que todo cuadre automático
    }
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
    else { toast.success('Frecuencia del proveedor actualizada.'); fetchCarreras(); }
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
    else { toast.success('Cuota de la unidad actualizada.'); fetchCarreras(); }
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
  const proveedoresUnicos = Array.from(new Set(carreras.map(c => c.proveedores?.nombre_proveedor))).filter(Boolean);

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

  carrerasFiltradas.forEach(c => {
    const valor = parseFloat(c.valor || 0);
    const comision = (valor > 5 && !c.exento_comision) ? valor * 0.10 : 0;
    
    const userKey = c.perfiles_usuario?.nombre_completo || 'Usuario Desconocido';
    const provKey = c.proveedores?.nombre_proveedor || 'Proveedor Desconocido';
    const unidadStr = c.unidades?.numero_equipo || 'N/A';
    const esCredito = c.metodo_pago === 'Credito';

    if (!resumenUsuarios[userKey]) {
      resumenUsuarios[userKey] = {
        usuario: userKey, unidad: unidadStr, unidad_id: c.unidad_id, viajes: 0, bruto: 0,
        creditos_a_favor: 0, comision_descontar: 0, tipo_cuota: c.unidades?.tipo_cuota || 'Frecuencia', valor_cuota: parseFloat(c.unidades?.valor_cuota || 0)
      };
    }
    resumenUsuarios[userKey].viajes += 1;
    resumenUsuarios[userKey].bruto += valor;
    resumenUsuarios[userKey].comision_descontar += comision;
    if (esCredito) {
      resumenUsuarios[userKey].creditos_a_favor += valor;
    }

    if (!resumenProveedores[provKey]) {
      resumenProveedores[provKey] = {
        proveedor: provKey, proveedor_id: c.proveedor_id, viajes: 0, bruto: 0, total_creditos: 0,
        comision_a_descontar: 0, cuota_frecuencia: parseFloat(c.proveedores?.cuota_frecuencia || 0)
      };
    }
    resumenProveedores[provKey].viajes += 1;
    resumenProveedores[provKey].bruto += valor;
    resumenProveedores[provKey].comision_a_descontar += comision;
    if (esCredito) resumenProveedores[provKey].total_creditos += valor;
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
      doc.setFont('', 'bold');
      doc.text(`Liquidación de Unidad: ${u.usuario}`, 14, 40);
      doc.setFont('', 'normal');
      doc.text(`Total Bruto: $${u.bruto.toFixed(2)}`, 14, 47);
      doc.text(`Credito a favor: $${u.creditos_a_favor.toFixed(2)}`, 14, 53);
      doc.text(`Comision en contra: -$${u.comision_descontar.toFixed(2)}`, 14, 59);
      doc.text(`Frecuencia: -$${u.valor_cuota.toFixed(2)}`, 14, 65);
      doc.setFont('', 'bold');
      doc.text(`Total: $${u.neto.toFixed(2)}`, 14, 73);
      startY = 82; 
    } 
    else if (filtroProveedor && datosLiquidacionProveedores.length > 0) {
      const p = datosLiquidacionProveedores[0]; 
      doc.setFont('', 'bold');
      doc.text(`Liquidación de Proveedor: ${p.proveedor}`, 14, 40);
      doc.setFont('', 'normal');
      doc.text(`Total Bruto: $${p.bruto.toFixed(2)}`, 14, 47);
      doc.text(`Credito a pagar: $${p.total_creditos.toFixed(2)}`, 14, 53);
      doc.text(`Comision en favor: -$${p.comision_a_descontar.toFixed(2)}`, 14, 59); 
      doc.text(`Frecuencia: +$${p.cuota_frecuencia.toFixed(2)}`, 14, 65); 
      doc.setFont('', 'bold');
      doc.text(`Total: $${p.total_a_cancelar.toFixed(2)}`, 14, 73);
      startY = 82; 
    }

    const tableData = carrerasFiltradas.map(c => {
      const valorNum = parseFloat(c.valor || 0);
      const comisionNum = (valorNum > 5 && !c.exento_comision) ? valorNum * 0.10 : 0;
      const detalleFinanzas = `$${valorNum.toFixed(2)} (${c.metodo_pago})\n${comisionNum > 0 ? `- $${comisionNum.toFixed(2)} Com.` : c.exento_comision ? 'Sin Com. (Exento)' : 'Sin Com.'}`;

      return [
        `${c.fecha}\n${c.hora_salida}`,
        `${c.cliente}\n(${c.servicio_a})${c.centro_costo ? `\nCC: ${c.centro_costo}` : ''}`,
        `${c.inicio} ->\n${c.destino}`,
        c.perfiles_usuario?.nombre_completo || 'N/A',
        `${c.proveedores?.nombre_proveedor || 'N/A'} - U:${c.unidades?.numero_equipo || ''}`,
        detalleFinanzas
      ];
    });

    autoTable(doc, { 
      startY: startY, 
      head: [['Fecha/Hora', 'Cliente/Serv.', 'Ruta', 'Operador', 'Logística', 'Finanzas']], 
      body: tableData, 
      theme: 'grid', 
      styles: { fontSize: 8, cellPadding: 3 }, 
      headStyles: { fillColor: [0, 0, 0] } 
    });
    
    doc.save('Reporte_LOGIC.pdf');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 relative">
      <ToastContainer />

      {/* --- VENTANA EMERGENTE DE EDICIÓN --- */}
      {carreraEditando && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">Editar Carrera</h2>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valor ($)</label>
                <input type="number" step="0.01" value={carreraEditando.valor} onChange={e => setCarreraEditando({...carreraEditando, valor: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 text-gray-900 focus:ring-black" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Método de Pago</label>
                <select value={carreraEditando.metodo_pago} onChange={e => setCarreraEditando({...carreraEditando, metodo_pago: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 text-gray-900 focus:ring-black">
                  <option value="Efectivo">Efectivo</option>
                  <option value="Credito">Crédito</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
              <input type="text" value={carreraEditando.cliente} onChange={e => setCarreraEditando({...carreraEditando, cliente: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 text-gray-900 focus:ring-black" />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Punto de Inicio</label>
                <input type="text" value={carreraEditando.inicio} onChange={e => setCarreraEditando({...carreraEditando, inicio: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 text-gray-900 focus:ring-black" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destino</label>
                <input type="text" value={carreraEditando.destino} onChange={e => setCarreraEditando({...carreraEditando, destino: e.target.value})} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 text-gray-900 focus:ring-black" />
              </div>
            </div>

            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <label className="flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={carreraEditando.exento_comision || false} 
                  onChange={e => setCarreraEditando({...carreraEditando, exento_comision: e.target.checked})} 
                  className="w-5 h-5 text-black border-gray-300 rounded focus:ring-black accent-black"
                />
                <span className="ml-3 font-medium text-gray-800">No cobrar 10% de comisión (Exento)</span>
              </label>
            </div>

            {/* BOTONES DE LA VENTANA (Se agregó el de ELIMINAR a la izquierda) */}
            <div className="flex gap-3 justify-end pt-4 border-t items-center">
              <button 
                onClick={() => eliminarCarrera(carreraEditando.id)} 
                disabled={guardandoEdicion}
                className="mr-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
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
          <div className="flex gap-3">
            <button onClick={fetchCarreras} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
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
              <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none text-red-600 bg-white">
                <option value="">Todos los operadores</option>
                {usuariosUnicos.map((user: any, index) => <option key={index} value={user}>{user}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Proveedor</label>
              <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white font-medium text-blue-700">
                <option value="">Todos los proveedores</option>
                {proveedoresUnicos.map((prov: any, index) => <option key={index} value={prov}>{prov}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-4 pt-4 border-t border-gray-100 items-end">
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Desde (Fecha Inicio)</label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 text-green-700 focus:ring-black outline-none" />
            </div>
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">Hasta (Fecha Fin)</label>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 text-amber-700 focus:ring-black outline-none" />
            </div>
            <div className="w-full md:w-auto">
              <button onClick={limpiarFiltros} className="w-full px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors h-[42px]">Limpiar Filtros</button>
            </div>
          </div>
        </div>

        {!loading && carrerasFiltradas.length > 0 && (
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
                    {datosLiquidacionUsuarios.map((u, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-amber-500"><span className="font-medium text-black">{u.usuario}</span><br/><span className="text-xs text-gray-500">U: {u.unidad}</span></td>
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
                    ))}
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
                      <th className="px-4 py-2 text-right text-green-600">Com. a favor</th>
                      <th className="px-4 py-2 text-right text-gray-600">Frecuencia</th>
                      <th className="px-4 py-2 text-right font-bold text-gray-900">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {datosLiquidacionProveedores.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-green-700">{p.proveedor}</td>
                        <td className="px-4 py-2 text-right text-gray-600">${p.bruto.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-blue-700">${p.total_creditos.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-green-600">${p.comision_a_descontar.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-gray-600 flex justify-end items-center">
                          ${p.cuota_frecuencia.toFixed(2)} 
                          <button onClick={() => actualizarCuotaProveedor(p.proveedor_id, p.proveedor, p.cuota_frecuencia)} className="ml-2 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded transition-colors" title="Editar frecuencia">✏️</button>
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-gray-900">${p.total_a_cancelar.toFixed(2)}</td>
                      </tr>
                    ))}
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