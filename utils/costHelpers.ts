import { RANKS } from '../constants';

export const getEffectiveCostItems = (formData: any) => {
  if (!formData) return [];
  const effectiveItems: any[] = [];
  const costSheet = formData.costSheetItems || [];
  const reportEffective = formData.reportEffectiveItems || [];

  costSheet.forEach((item: any) => {
    // Find matching effective report item
    const alt = reportEffective.find((r: any) => 
      r.soldierMf === item.soldierMatricula || 
      r.soldierMatricula === item.soldierMatricula || 
      r.id === item.id
    );
    
    if (alt) {
      if (alt.status === 'P/A' || alt.substituteName || alt.substituteMf) {
        const rawSubName = (alt.substituteName || '').trim();
        const rawSubMf = (alt.substituteMf || '').trim();

        if (rawSubName || rawSubMf) {
           let rank = '';
           let name = rawSubName || 'SUBSTITUTO';
           let mf = rawSubMf;

           // Match "RANK NAME (Mat: MATRICULA)"
           const matchFull = name.match(/^(.*?)\s+(.*?)\s+\(Mat:\s*([^\)]+)\)/i);
           if (matchFull) {
               rank = matchFull[1];
               name = matchFull[2];
               if (!mf) mf = matchFull[3];
           } else {
               const matchMat = name.match(/^(.*?)\s+\(Mat:\s*([^\)]+)\)/i);
               if (matchMat) {
                   name = matchMat[1];
                   if (!mf) mf = matchMat[2];
               }
           }

           if (!rank) {
             for (const r of RANKS) {
               if (name.toUpperCase().startsWith(r.toUpperCase())) {
                 rank = r;
                 name = name.substring(r.length).trim();
                 break;
               }
             }
           }

           effectiveItems.push({
             ...item,
             soldierMatricula: mf || item.soldierMatricula,
             soldierName: name || 'SUBSTITUTO',
             soldierRank: rank || item.soldierRank || '-',
             isSubstituted: true,
             originalSoldierName: item.soldierName,
             originalSoldierRank: item.soldierRank,
             originalSoldierMatricula: item.soldierMatricula
           });
           return;
        }
      }
      if (alt.status === 'F' || alt.status === 'D') {
        // Falta or Dispensa without substitute -> No payment for original soldier
        return; 
      }
    }
    
    // Default: no alteration or present
    effectiveItems.push(item);
  });
  
  return effectiveItems;
};

