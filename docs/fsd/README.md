# FSD deck (VVS_Tax_Portal_FSD.pptx)

24-slide Functional Specification Document for the VVS Tax Consultancy Portal, built from live data on site `consultant`.
Includes DFD level 0 (context) and level 1 (processes, data stores, flows) as native, editable PowerPoint shapes. Version 1.1 adds the two ways to file, acting for the client (Data Entry role) and the demo videos (stills in img/).
A PDF copy (`VVS_Tax_Portal_FSD.pdf`) is kept next to it.

1. Extract the data (writes `fsd_data.json` here):
   `echo 'exec(open("/home/maqmalak/erpnext-react/apps/pakistan_tax_consultancy/docs/fsd/fsd_data.py").read())' | bench --site consultant console`
2. Build (needs pptxgenjs, react, react-dom, react-icons, sharp in some node_modules):
   `SKILL=<pptx skill dir> NODE_PATH=<node_modules> node build_fsd_deck.js VVS_Tax_Portal_FSD.pptx`
