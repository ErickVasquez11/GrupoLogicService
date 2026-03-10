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

  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroProveedor, setFiltroProveedor] = useState('');

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
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/');
        return;
      }
      fetchCarreras();
    };
    checkSession();
  }, [router]);

  const actualizarCuotaProveedor = async (id: string, nombre: string, valorActual: number) => {
    if (!id) return;
    const nuevoValor = prompt(`Ingrese la nueva Cuota de Frecuencia ($) para ${nombre}:`, valorActual.toString());
    if (nuevoValor === null) return;
    
    const num = parseFloat(nuevoValor);
    if (isNaN(num) || num < 0) return toast.warning('Por favor, ingrese un número válido.');

    toast.info('Actualizando...');
    const { error } = await supabase.from('proveedores').update({ cuota_frecuencia: num }).eq('id', id);
    
    if (error) {
      toast.error('Error al actualizar: ' + error.message);
    } else {
      toast.success('Frecuencia del proveedor actualizada.');
      fetchCarreras();
    }
  };

  const actualizarCuotaUnidad = async (id: string, equipo: string, tipo: string, valorActual: number) => {
    if (!id) return toast.error('Este operador no tiene una unidad asignada para cobrarle cuota.');
    
    const nuevoValor = prompt(`Ingrese el nuevo valor de la cuota (${tipo}) para la Unidad ${equipo}:`, valorActual.toString());
    if (nuevoValor === null) return;
    
    const num = parseFloat(nuevoValor);
    if (isNaN(num) || num < 0) return toast.warning('Por favor, ingrese un número válido.');

    toast.info('Actualizando...');
    const { error } = await supabase.from('unidades').update({ valor_cuota: num }).eq('id', id);
    
    if (error) {
      toast.error('Error al actualizar: ' + error.message);
    } else {
      toast.success('Cuota de la unidad actualizada.');
      fetchCarreras();
    }
  };

  const usuariosUnicos = Array.from(new Set(carreras.map(c => c.perfiles_usuario?.nombre_completo))).filter(Boolean);
  const proveedoresUnicos = Array.from(new Set(carreras.map(c => c.proveedores?.nombre_proveedor))).filter(Boolean);

  const carrerasFiltradas = carreras.filter(carrera => {
    const coincideUsuario = filtroUsuario ? carrera.perfiles_usuario?.nombre_completo === filtroUsuario : true;
    const coincideProveedor = filtroProveedor ? carrera.proveedores?.nombre_proveedor === filtroProveedor : true;
    return coincideUsuario && coincideProveedor;
  });

  const resumenUsuarios: Record<string, any> = {};
  const resumenProveedores: Record<string, any> = {};

  carrerasFiltradas.forEach(c => {
    const valor = parseFloat(c.valor || 0);
    const comision = valor > 5 ? valor * 0.10 : 0;
    
    const userKey = c.perfiles_usuario?.nombre_completo || 'Usuario Desconocido';
    const provKey = c.proveedores?.nombre_proveedor || 'Proveedor Desconocido';
    const unidadStr = c.unidades?.numero_equipo || 'N/A';
    const esCredito = c.metodo_pago === 'Credito';

    if (!resumenUsuarios[userKey]) {
      resumenUsuarios[userKey] = {
        usuario: userKey,
        unidad: unidadStr,
        unidad_id: c.unidad_id,
        viajes: 0,
        bruto: 0,
        comision_descontar: 0,
        tipo_cuota: c.unidades?.tipo_cuota || 'Frecuencia',
        valor_cuota: parseFloat(c.unidades?.valor_cuota || 0)
      };
    }
    resumenUsuarios[userKey].viajes += 1;
    resumenUsuarios[userKey].bruto += valor;
    resumenUsuarios[userKey].comision_descontar += comision;

    if (!resumenProveedores[provKey]) {
      resumenProveedores[provKey] = {
        proveedor: provKey,
        proveedor_id: c.proveedor_id,
        viajes: 0,
        total_creditos: 0,
        comision_a_descontar: 0,
        cuota_frecuencia: parseFloat(c.proveedores?.cuota_frecuencia || 0)
      };
    }
    resumenProveedores[provKey].viajes += 1;
    resumenProveedores[provKey].comision_a_descontar += comision;
    
    if (esCredito) {
      resumenProveedores[provKey].total_creditos += valor;
    }
  });

  const datosLiquidacionUsuarios = Object.values(resumenUsuarios).map(u => ({
    ...u,
    neto: u.bruto - u.comision_descontar - u.valor_cuota
  }));

  const datosLiquidacionProveedores = Object.values(resumenProveedores).map(p => ({
    ...p,
    total_a_cancelar: p.total_creditos - p.comision_a_descontar - p.cuota_frecuencia
  }));

  const generarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Reporte de Carreras - Grupo LOGIC', 14, 22);
    doc.setFontSize(11);
    let textoFiltro = `Generado el: ${new Date().toLocaleDateString()}`;
    if (filtroUsuario) textoFiltro += ` | Operador: ${filtroUsuario}`;
    if (filtroProveedor) textoFiltro += ` | Proveedor: ${filtroProveedor}`;
    doc.text(textoFiltro, 14, 30);

    const tableData = carrerasFiltradas.map(c => {
      const valorNum = parseFloat(c.valor || 0);
      const comisionNum = valorNum > 5 ? valorNum * 0.10 : 0;
      const detalleFinanzas = `$${valorNum.toFixed(2)} (${c.metodo_pago})\n${comisionNum > 0 ? `- $${comisionNum.toFixed(2)} Com.` : 'Sin Com.'}`;

      return [
        `${c.fecha}\n${c.hora_salida}`,
        // AGREGADO EL CENTRO DE COSTO AL PDF
        `${c.cliente}\n(${c.servicio_a})${c.centro_costo ? `\nCC: ${c.centro_costo}` : ''}`,
        `${c.inicio} ->\n${c.destino}`,
        c.perfiles_usuario?.nombre_completo || 'N/A',
        `${c.proveedores?.nombre_proveedor || 'N/A'} - U:${c.unidades?.numero_equipo || ''}`,
        detalleFinanzas
      ];
    });

    autoTable(doc, {
      startY: 35,
      head: [['Fecha/Hora', 'Cliente/Serv.', 'Ruta', 'Operador', 'Logística', 'Finanzas']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [0, 0, 0] }
    });
    doc.save('Reporte_LOGIC.pdf');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <ToastContainer />
      <div className="max-w-7xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
            <p className="text-gray-500 text-sm">Liquidaciones y Reporte General</p>
          </div>
          <div className="flex gap-3">
            <button onClick={generarPDF} className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-2">
              Exportar PDF
            </button>
            <button onClick={() => router.push('/registrar')} className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              Ir a Registro
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Operador (Usuario)</label>
            <select value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black text-black outline-none bg-white">
              <option value="">Todos los operadores</option>
              {usuariosUnicos.map((user: any, index) => <option key={index} value={user}>{user}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Proveedor (Reporte individual)</label>
            <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black outline-none bg-white text-blue-700 font-medium">
              <option value="">Mostrar todos los proveedores</option>
              {proveedoresUnicos.map((prov: any, index) => <option key={index} value={prov}>{prov}</option>)}
            </select>
          </div>
        </div>

        {!loading && carrerasFiltradas.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="bg-blue-50 px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-blue-900">Liquidación por Operador (Usuario)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-4 py-2">Operador / Unidad</th>
                      <th className="px-4 py-2 text-right">Bruto</th>
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
                        <td className="px-4 py-2 text-right text-red-500">-${u.comision_descontar.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-red-500">
                          -${u.valor_cuota.toFixed(2)}
                          {u.unidad_id && (
                            <button 
                              onClick={() => actualizarCuotaUnidad(u.unidad_id, u.unidad, u.tipo_cuota, u.valor_cuota)}
                              className="ml-2 inline-block text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded transition-colors"
                              title="Editar cuota"
                            >
                              ✏️
                            </button>
                          )}
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
              <div className="bg-purple-50 px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-purple-900">Reporte de Liquidación del Proveedor</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-600 font-medium">
                    <tr>
                      <th className="px-4 py-2 ">Proveedor</th>
                      <th className="px-4 py-2 text-right text-blue-700">Total Créditos</th>
                      <th className="px-4 py-2 text-right text-red-600">- Comisión</th>
                      <th className="px-4 py-2 text-right text-red-600">- Frecuencia</th>
                      <th className="px-4 py-2 text-right font-bold text-green-700">A CANCELAR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {datosLiquidacionProveedores.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-green-700">{p.proveedor}</td>
                        <td className="px-4 py-2 text-right text-blue-700">${p.total_creditos.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-red-500">-${p.comision_a_descontar.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-red-500 flex justify-end items-center">
                          -${p.cuota_frecuencia.toFixed(2)}
                          {p.proveedor_id && (
                            <button 
                              onClick={() => actualizarCuotaProveedor(p.proveedor_id, p.proveedor, p.cuota_frecuencia)}
                              className="ml-2 text-[10px] bg-gray-200 hover:bg-gray-300 text-gray-700 px-1.5 py-0.5 rounded transition-colors"
                              title="Editar frecuencia"
                            >
                              ✏️
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-bold text-green-700">${p.total_a_cancelar.toFixed(2)}</td>
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
          <span className="text-sm font-normal text-gray-500">{carrerasFiltradas.length} carreras mostradas</span>
        </h3>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Cargando reportes...</div>
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
                    const comisionNum = valorNum > 5 ? valorNum * 0.10 : 0;

                    return (
                      <tr key={carrera.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.fecha}</div>
                          <div className="text-gray-500">{carrera.hora_salida}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{carrera.cliente}</div>
                          <div className="text-gray-500">{carrera.servicio_a}</div>
                          {/* AGREGADO EL CENTRO DE COSTO A LA TABLA DEL ADMIN */}
                          {carrera.centro_costo && (
                            <div className="text-xs font-medium text-indigo-600 mt-1">CC: {carrera.centro_costo}</div>
                          )}
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
                          <div className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full inline-block mt-1">
                            {carrera.metodo_pago}
                          </div>
                          {comisionNum > 0 && (
                            <div className="text-xs font-medium text-red-500 mt-1">
                              - ${comisionNum.toFixed(2)} (Comisión)
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {carrerasFiltradas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No se encontraron carreras.
                      </td>
                    </tr>
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