import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const buildTree = (items) => {
  const byId = new Map(items.map((item) => [item.id, { ...item, children: [] }]));
  const roots = [];

  byId.forEach((item) => {
    if (item.parent_id && byId.has(item.parent_id)) {
      byId.get(item.parent_id).children.push(item);
    } else {
      roots.push(item);
    }
  });

  const sortNode = (node) => {
    node.children.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    node.children.forEach(sortNode);
    return node;
  };

  return roots.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(sortNode);
};

const collectSubtree = (nodes, rootId) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ids = [];

  const walk = (id) => {
    const node = byId.get(id);
    if (!node) return;
    ids.push(id);
    nodes.filter((item) => item.parent_id === id).forEach((child) => walk(child.id));
  };

  walk(rootId);
  return ids;
};

export function useCategorias() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: fetchError } = await supabase.from('categorias').select('id, nombre, parent_id').order('nombre', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
      setCategorias([]);
    } else {
      setError(null);
      setCategorias(data || []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    load().finally(() => {
      if (!mounted) return;
    });

    return () => {
      mounted = false;
    };
  }, [load]);

  const tree = useMemo(() => buildTree(categorias), [categorias]);

  const flatOptions = useMemo(() => {
    const flatten = (nodes, prefix = []) =>
      nodes.flatMap((node) => {
        const path = [...prefix, node.nombre];
        const label = path.join(' > ');
        return [{ ...node, label }, ...flatten(node.children || [], path)];
      });

    return flatten(tree);
  }, [tree]);

  const createCategoria = async ({ nombre, parent_id = null }) => {
    const cleanNombre = nombre?.trim();
    if (!cleanNombre) throw new Error('El nombre de la categoría es obligatorio.');
    const { error: insertError } = await supabase.from('categorias').insert({ nombre: cleanNombre, parent_id: parent_id || null });
    if (insertError) throw insertError;
    await load();
  };

  const updateCategoria = async (id, { nombre, parent_id = null }) => {
    const cleanNombre = nombre?.trim();
    if (!cleanNombre) throw new Error('El nombre de la categoría es obligatorio.');
    const { error: updateError } = await supabase.from('categorias').update({ nombre: cleanNombre, parent_id: parent_id || null }).eq('id', id);
    if (updateError) throw updateError;
    await load();
  };

  const deleteCategoria = async (id) => {
    const subtreeIds = collectSubtree(categorias, id);
    if (!subtreeIds.length) return;

    const { error: itemsError } = await supabase.from('items_detalle').update({ categoria_id: null }).in('categoria_id', subtreeIds);
    if (itemsError) throw itemsError;

    const orderedIds = subtreeIds
      .map((nodeId) => ({ id: nodeId, depth: (() => {
        let depth = 0;
        let current = categorias.find((item) => item.id === nodeId);
        while (current?.parent_id) {
          depth += 1;
          current = categorias.find((item) => item.id === current.parent_id);
        }
        return depth;
      })() }))
      .sort((a, b) => b.depth - a.depth)
      .map((entry) => entry.id);

    for (const categoryId of orderedIds) {
      const { error: deleteError } = await supabase.from('categorias').delete().eq('id', categoryId);
      if (deleteError) throw deleteError;
    }

    await load();
  };

  return { categorias, tree, flatOptions, loading, error, refetch: load, createCategoria, updateCategoria, deleteCategoria };
}
