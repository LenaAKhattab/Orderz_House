async function fetchAllPages(baseUrl = "http://localhost:5000/api/public/sub-subcategories") {
  const all = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const res = await fetch(`${baseUrl}?page=${page}&limit=16`);
    const json = await res.json();
    const data = json.data || {};
    all.push(...(data.items || []));
    totalPages = data.totalPages || 1;
    page += 1;
  }
  return all;
}

fetchAllPages()
  .then((items) => {
    console.log(JSON.stringify({ apiTotal: items.length, firstId: items[0]?.id, lastId: items[items.length - 1]?.id }, null, 2));
  })
  .catch((e) => console.error(e));
