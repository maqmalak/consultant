p = '/home/maqmalak/erpnext-react/apps/incometax/frontend/src/pages/tax-return-form/page.tsx'
s = open(p).read()
reps = [
 ("import { useCallback, useEffect, useMemo, useRef, useState } from \"react\";", "import { useCallback, useEffect, useState } from \"react\";"),
 ("import { useFrappeGetCall, useFrappePostCall } from \"frappe-react-sdk\";", "import { useFrappeGetCall } from \"frappe-react-sdk\";"),
 ("import type { TaxClient, TaxReturn } from \"@/types\";", "import type { TaxClient } from \"@/types\";"),
 ("import { formatCurrency } from \"@/lib/format\";\n", ""),
 ("import { EmptyRow, Table, TH, TR, TD } from \"@/components/ui/table\";\n", ""),
 ("import { ChildTableEditor } from \"@/components/tax-return/child-table-editor\";\n", ""),
 ("import { NumberInput } from \"@/components/tax-return/form-controls\";\n", ""),
 ("import { CLIENTS_METHOD, DOC_GET_METHOD, STEPS, TStep } from \"./config\";", "import { CLIENTS_METHOD, DOC_GET_METHOD, STEPS, TStatus } from \"./config\";"),
]
for a,b in reps:
    if a in s:
        s = s.replace(a,b,1)
    else:
        print('MISSING:', a[:70])
open(p,'w').write(s)
