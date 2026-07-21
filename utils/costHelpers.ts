export const getEffectiveCostItems = (formData: any) => {
  const effectiveItems: any[] = [];
  
  (formData.costSheetItems || []).forEach((item: any) => {
    // If there is an effective alteration (Relatório)
    const alt = (formData.reportEffectiveItems || []).find((r: any) => r.soldierMf === item.soldierMatricula);
    
    if (alt) {
      if (alt.status === 'F' || alt.status === 'D') {
        // Falta or Dispensa -> No payment
        return; 
      }
      if (alt.status === 'P/A' || alt.substituteMf) {
        if (alt.substituteMf) {
           let rank = item.soldierRank;
           let name = alt.substituteName || 'SUBSTITUTO';
           // Parse substituteName which is formatted as "POSTO NOME (Mat: MATRICULA)"
           const match = name.match(/^(.*?)\s+(.*?)\s+\(Mat:/);
           if (match) {
               rank = match[1];
               name = match[2];
           } else {
               name = name.split(' (Mat:')[0];
           }

           effectiveItems.push({
             ...item,
             soldierMatricula: alt.substituteMf,
             soldierName: name,
             soldierRank: rank
           });
           return;
        }
      }
    }
    
    // Default: no alteration or present
    effectiveItems.push(item);
  });
  
  return effectiveItems;
}
